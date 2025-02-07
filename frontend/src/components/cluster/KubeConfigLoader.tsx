import { InlineIcon } from '@iconify/react';
import { Button, Checkbox, FormControl, Grid, Tooltip } from '@mui/material';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import * as yaml from 'js-yaml';
import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useClustersConf } from '../../lib/k8s';
import { setCluster } from '../../lib/k8s/apiProxy';
import { setStatelessConfig } from '../../redux/configSlice';
import { DialogTitle } from '../common/Dialog';
import Loader from '../common/Loader';
import { ClusterDialog } from './Chooser';

interface Cluster {
  name: string;
  cluster: {
    server: string;
    [key: string]: any;
  };
}

interface User {
  name: string;
  user: {
    token: string;
    [key: string]: any;
  };
}

interface kubeconfig {
  clusters: Cluster[];
  users: User[];
  contexts: { name: string; context: { cluster: string; user: string } }[];
  currentContext: string;
}

function configWithSelectedClusters(config: kubeconfig, selectedClusters: string[]): kubeconfig {
  const newConfig: kubeconfig = {
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  };

  // We use a map to avoid duplicates since many contexts can point to the same cluster/user.
  const clusters: { [key: string]: Cluster } = {};
  const users: { [key: string]: User } = {};

  selectedClusters.forEach(clusterName => {
    const context = config.contexts.find(c => c.name === clusterName);
    if (!context) {
      return;
    }

    const cluster = config.clusters.find(c => c.name === context.context.cluster);
    if (!cluster) {
      return;
    }
    clusters[cluster.name] = cluster;

    // Optionally add the user.
    const user = config.users?.find(c => c.name === context.context.user);
    if (!!user) {
      users[user.name] = user;
    }

    newConfig.contexts.push(context);
  });

  newConfig.clusters = Object.values(clusters);
  newConfig.users = Object.values(users);

  return newConfig;
}

const DropZoneBox = styled(Box)({
  border: 1,
  borderRadius: 1,
  borderWidth: 2,
  borderColor: 'rgba(0, 0, 0)',
  borderStyle: 'dashed',
  padding: '20px',
  margin: '20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  '&:hover': {
    borderColor: 'rgba(0, 0, 0, 0.5)',
  },
  '&:focus-within': {
    borderColor: 'rgba(0, 0, 0, 0.5)',
  },
});

const WideButton = styled(Button)({
  width: '100%',
  maxWidth: '300px',
});

const enum Step {
  LoadKubeConfig,
  SelectClusters,
  ValidateKubeConfig,
  ConfigureClusters,
  Success,
}

// Maximum length for DNS labels according to RFC 1123
const MAX_DNS_LABEL_LENGTH = 63;

// Validates a context name according to DNS label rules and cloud provider formats
const validateContextName = (name: string): { isValid: boolean; message?: string } => {
  if (!name) {
    return { isValid: false, message: 'Context name cannot be empty' };
  }

  // Special handling for GKE format
  if (name.startsWith('gke_') && name.split('_').length >= 4) {
    const gkeRegex = /^gke_[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+$/;
    if (gkeRegex.test(name)) {
      return { isValid: true };
    }
  }

  // Convert to DNS-friendly format and validate
  const friendlyName = makeDNSFriendly(name);

  if (friendlyName.length > MAX_DNS_LABEL_LENGTH) {
    return {
      isValid: false,
      message: `Context name must be ${MAX_DNS_LABEL_LENGTH} characters or less`,
    };
  }

  // Check for valid DNS label format
  const validDNSLabel = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (!validDNSLabel.test(friendlyName)) {
    return {
      isValid: false,
      message:
        'Context name must contain only lowercase letters, numbers, and hyphens, and must start and end with a letter or number',
    };
  }

  return { isValid: true };
};

// Helper to convert a string to DNS-friendly format (matching backend implementation)
const makeDNSFriendly = (name: string): string => {
  if (!name) return 'unnamed-context';

  // Special handling for GKE format
  if (name.startsWith('gke_') && name.split('_').length >= 4) {
    const gkeRegex = /^gke_[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+$/;
    if (gkeRegex.test(name)) {
      return name;
    }
  }

  // Handle cloud provider formats and special characters
  const replacements: { [key: string]: string } = {
    '/': '-', // Path separator (AWS ARN)
    ' ': '__', // Spaces (human readability)
    ':': '-', // ARN separator (AWS)
    '=': '-eq-', // IAM path character
    '+': '-plus-', // IAM path character
    ',': '-', // IAM path character
    '@': '-at-', // IAM path character
    '\\': '-', // Windows path separator
    '(': '-', // AKS allowed character
    ')': '-', // AKS allowed character
    '*': '-star-', // Wildcard character in ARNs
    '.': '-', // Convert dots to hyphens
  };

  let result = name.toLowerCase();

  // Apply character replacements
  Object.entries(replacements).forEach(([old, replacement]) => {
    result = result.split(old).join(replacement);
  });

  // Replace any remaining non-alphanumeric characters with hyphens
  result = result.replace(/[^a-z0-9-]/g, '-');

  // Remove consecutive hyphens
  result = result.replace(/-+/g, '-');

  // Trim hyphens from start and end
  result = result.replace(/^-+|-+$/g, '');

  // Ensure the name starts and ends with alphanumeric characters
  if (!result || !/^[a-z0-9]/.test(result)) {
    result = 'x-' + result;
  }
  if (!/[a-z0-9]$/.test(result)) {
    result = result + '-x';
  }

  // Truncate if too long, preserving meaningful parts
  if (result.length > MAX_DNS_LABEL_LENGTH) {
    if (result.includes('-')) {
      const parts = result.split('-');
      const targetLen = Math.floor((MAX_DNS_LABEL_LENGTH - (parts.length - 1)) / parts.length);
      if (targetLen >= 1) {
        result = parts.map(part => part.slice(0, targetLen)).join('-');
      } else {
        // If we can't fit all parts, take first and last
        result = `${parts[0].slice(0, 1)}-${parts[parts.length - 1].slice(0, 1)}`;
      }
    } else {
      result = result.slice(0, MAX_DNS_LABEL_LENGTH);
    }
  }

  return result || 'unnamed-context';
};

function KubeConfigLoader() {
  const history = useHistory();
  const [state, setState] = useState(Step.LoadKubeConfig);
  const [error, setError] = React.useState('');
  const [fileContent, setFileContent] = useState<kubeconfig>({
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  });
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const configuredClusters = useClustersConf(); // Get already configured clusters
  const [contextNameErrors, setContextNameErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (fileContent.contexts.length > 0) {
      setSelectedClusters(fileContent.contexts.map(context => context.name));
      setState(Step.SelectClusters);
    }
    return () => {};
  }, [fileContent]);

  useEffect(() => {
    if (state === Step.ValidateKubeConfig) {
      const alreadyConfiguredClusters = selectedClusters.filter(
        clusterName => configuredClusters && configuredClusters[clusterName]
      );

      if (alreadyConfiguredClusters.length > 0) {
        setError(
          t(
            'translation|Duplicate cluster: {{ clusterNames }} in the list. Please edit the context name.',
            {
              clusterNames: alreadyConfiguredClusters.join(', '),
            }
          )
        );
        setState(Step.SelectClusters);
      } else {
        setState(Step.ConfigureClusters);
      }
    }
    if (state === Step.ConfigureClusters) {
      function loadClusters() {
        const selectedClusterConfig = configWithSelectedClusters(fileContent, selectedClusters);
        setCluster({ kubeconfig: btoa(yaml.dump(selectedClusterConfig)) })
          .then(res => {
            if (res?.clusters?.length > 0) {
              dispatch(setStatelessConfig(res));
            }
            setState(Step.Success);
          })
          .catch(e => {
            console.debug('Error setting up clusters from kubeconfig:', e);
            setError(
              t('translation|Error setting up clusters, please load a valid kubeconfig file')
            );
            setState(Step.SelectClusters);
          });
      }
      loadClusters();
    }
    return () => {};
  }, [state]);

  const dispatch = useDispatch();
  const { t } = useTranslation(['translation']);

  const onDrop = (acceptedFiles: Blob[]) => {
    setError('');
    const reader = new FileReader();
    reader.onerror = () => setError(t("translation|Couldn't read kubeconfig file"));
    reader.onload = () => {
      try {
        const data = String.fromCharCode.apply(null, [
          ...new Uint8Array(reader.result as ArrayBuffer),
        ]);
        const doc = yaml.load(data) as kubeconfig;
        if (!doc.clusters) {
          throw new Error(t('translation|No clusters found!'));
        }
        if (!doc.contexts) {
          throw new Error(t('translation|No contexts found!'));
        }
        setFileContent(doc);
      } catch (err) {
        setError(
          t(`translation|Invalid kubeconfig file: {{ errorMessage }}`, {
            errorMessage: (err as Error).message,
          })
        );
        return;
      }
    };
    reader.readAsArrayBuffer(acceptedFiles[0]);
  };

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: onDrop,
    multiple: false,
  });

  const handleContextSelect = (event: React.ChangeEvent<HTMLInputElement>, contextName: string) => {
    const validation = validateContextName(contextName);

    if (!validation.isValid) {
      setContextNameErrors(prev => ({
        ...prev,
        [contextName]: validation.message || 'Invalid context name',
      }));
      // Optionally prevent selection of invalid contexts
      return;
    }

    setContextNameErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[contextName];
      return newErrors;
    });

    const checked = event.target.checked;
    if (checked) {
      setSelectedClusters(prev => [...prev, contextName]);
    } else {
      setSelectedClusters(prev => prev.filter(name => name !== contextName));
    }
  };

  function renderSwitch() {
    switch (state) {
      case Step.LoadKubeConfig:
        return (
          <Box>
            <DropZoneBox border={1} borderColor="secondary.main" {...getRootProps()}>
              <FormControl>
                <input {...getInputProps()} />
                <Tooltip
                  title={t('translation|Drag & drop or choose kubeconfig file here')}
                  placement="top"
                >
                  <Button
                    variant="contained"
                    onClick={() => open}
                    startIcon={<InlineIcon icon="mdi:upload" width={32} />}
                  >
                    {t('translation|Choose file')}
                  </Button>
                </Tooltip>
              </FormControl>
            </DropZoneBox>
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <WideButton onClick={() => history.goBack()}>{t('translation|Back')}</WideButton>
            </Box>
          </Box>
        );
      case Step.SelectClusters:
        return (
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
              alignItems: 'center',
            }}
          >
            <Typography>{t('translation|Select clusters')}</Typography>
            {fileContent.clusters ? (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    justifyContent: 'center',
                    padding: '15px',
                    width: '100%',
                    maxWidth: '300px',
                  }}
                >
                  <FormControl
                    sx={{
                      overflowY: 'auto',
                      height: '150px',
                      paddingLeft: '10px',
                      paddingRight: '10px',
                      width: '100%',
                    }}
                  >
                    {fileContent.contexts.map(context => (
                      <FormControlLabel
                        key={context.name}
                        control={
                          <Checkbox
                            value={context.name}
                            name={context.name}
                            color="primary"
                            checked={selectedClusters.includes(context.name)}
                            onChange={e => handleContextSelect(e, context.name)}
                          />
                        }
                        label={
                          <Box>
                            <Typography>
                              {context.name}
                              {context.name !== makeDNSFriendly(context.name) && (
                                <Typography
                                  variant="caption"
                                  color="textSecondary"
                                  component="span"
                                >
                                  {' '}
                                  (will be saved as: {makeDNSFriendly(context.name)})
                                </Typography>
                              )}
                            </Typography>
                            {contextNameErrors[context.name] && (
                              <Typography color="error" variant="caption">
                                {contextNameErrors[context.name]}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    ))}
                  </FormControl>
                  <Grid
                    container
                    direction="column"
                    spacing={2}
                    justifyContent="center"
                    alignItems="stretch"
                  >
                    <Grid item>
                      <WideButton
                        variant="contained"
                        color="primary"
                        onClick={() => {
                          setState(Step.ValidateKubeConfig);
                        }}
                        disabled={selectedClusters.length === 0}
                      >
                        {t('translation|Next')}
                      </WideButton>
                    </Grid>
                    <Grid item>
                      <WideButton
                        onClick={() => {
                          setError('');
                          setState(Step.LoadKubeConfig);
                        }}
                      >
                        {t('translation|Back')}
                      </WideButton>
                    </Grid>
                  </Grid>
                </Box>
              </>
            ) : null}
          </Box>
        );
      case Step.ValidateKubeConfig:
        return (
          <Box style={{ textAlign: 'center' }}>
            <Typography>{t('translation|Validating selected clusters')}</Typography>
            <Loader title={t('translation|Validating selected clusters')} />
          </Box>
        );
      case Step.ConfigureClusters:
        return (
          <Box style={{ textAlign: 'center' }}>
            <Typography>{t('translation|Setting up clusters')}</Typography>
            <Loader title={t('translation|Setting up clusters')} />
          </Box>
        );
      case Step.Success:
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
              alignItems: 'center',
            }}
          >
            <Box style={{ padding: '32px' }}>
              <Typography>{t('translation|Clusters successfully set up!')}</Typography>
            </Box>
            <WideButton variant="contained" onClick={() => history.replace('/')}>
              {t('translation|Finish')}
            </WideButton>
          </Box>
        );
    }
  }

  return (
    <ClusterDialog
      showInfoButton={false}
      // Disable backdrop clicking.
      onClose={() => {}}
      useCover
    >
      <DialogTitle>{t('translation|Load from KubeConfig')}</DialogTitle>
      {error && error !== '' ? (
        <Box style={{ backgroundColor: 'red', textAlign: 'center', padding: '4px' }}>{error}</Box>
      ) : null}
      <Box>{renderSwitch()}</Box>
    </ClusterDialog>
  );
}

export default KubeConfigLoader;
