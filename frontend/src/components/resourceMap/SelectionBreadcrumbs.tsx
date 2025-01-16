import { Box, Breadcrumbs, Link } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getMainNode } from './graph/graphGrouping';
import { GraphNode } from './graph/graphModel';
import { KubeIcon } from './kubeIcon/KubeIcon';

/**
 * Find a path in graph from root to the selected node
 */
function findSelectionPath(graph: GraphNode, selectedNodeId?: string) {
  function dfs(node: GraphNode, path: GraphNode[]): GraphNode[] | null {
    path.push(node);

    if (node.id === selectedNodeId) {
      return path;
    }

    if (node.nodes) {
      for (const child of node.nodes) {
        const result = dfs(child, path);
        if (result) {
          return result;
        }
      }
    }

    path.pop();
    return null;
  }

  const result = dfs(graph, []);
  return result || [];
}

export interface SelectionBreadcrumbsProps {
  /** The graph in which to search the selected node */
  graph: GraphNode;
  /** The ID of the selected node */
  selectedNodeId?: string;
  /** Callback when a node is clicked */
  onNodeClick: (id: string) => void;
}

export function SelectionBreadcrumbs({
  graph,
  selectedNodeId,
  onNodeClick,
}: SelectionBreadcrumbsProps) {
  const { t } = useTranslation();
  const path = findSelectionPath(graph, selectedNodeId);

  return (
    <Breadcrumbs maxItems={4}>
      {path.map((it, i) => {
        const getLabel = (node: GraphNode) => {
          if (node.id === 'root') {
            return t('translation|Home');
          }
          if (node.label) {
            return node.label;
          }
          if (node.kubeObject) {
            return node.kubeObject.metadata.name;
          }

          const maybeMainNode = node.nodes ? getMainNode(node.nodes) : undefined;
          if (maybeMainNode) {
            return maybeMainNode.kubeObject?.metadata.name;
          }

          return '';
        };

        const icon = it?.kubeObject?.kind ? (
          <KubeIcon kind={it.kubeObject.kind} width="24px" height="24px" />
        ) : null;

        const subtitle = it.subtitle ?? it?.kubeObject?.kind;
        const subtitleElement = subtitle ? <Box sx={{ opacity: 0.7 }}>{subtitle}</Box> : null;
        return i === path.length - 1 ? (
          <Box
            key={it.id}
            sx={{
              display: 'flex',
              gap: 0.5,
            }}
          >
            {icon} {subtitleElement} {getLabel(it)}
          </Box>
        ) : (
          <Link
            key={it.id}
            onClick={() => onNodeClick(it.id)}
            sx={{
              display: 'flex',
              gap: 0.5,
              textTransform: 'unset',
              maxWidth: '200px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer',
            }}
          >
            {icon} {subtitleElement} {getLabel(it)}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
}
