const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const BatchInstaller = require('../batch-installer');

describe('BatchInstaller', () => {
  let tempDir;
  let configPath;
  let installer;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'headlamp-test-'));
    configPath = path.join(tempDir, 'plugins.yaml');
    installer = new BatchInstaller(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validateConfig', () => {
    it('should validate a valid configuration', async () => {
      const config = `
plugins:
  - name: test-plugin
    source: https://example.com/plugin.tar.gz
    version: 1.0.0
    config:
      key: value
`;
      await fs.writeFile(configPath, config);
      
      const result = await installer.configValidator.validateConfig(configPath);
      expect(result).toBeDefined();
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('test-plugin');
    });

    it('should reject invalid configuration', async () => {
      const config = `
plugins:
  - source: https://example.com/plugin.tar.gz
`;
      await fs.writeFile(configPath, config);
      
      await expect(installer.configValidator.validateConfig(configPath))
        .rejects.toThrow('Configuration validation failed');
    });
  });

  describe('installFromConfig', () => {
    it('should handle missing configuration file', async () => {
      await expect(installer.installFromConfig('/nonexistent/config.yaml'))
        .rejects.toThrow('Configuration file not found');
    });

    it('should handle invalid source URLs', async () => {
      const config = `
plugins:
  - name: test-plugin
    source: invalid-url
`;
      await fs.writeFile(configPath, config);
      
      await expect(installer.installFromConfig(configPath))
        .rejects.toThrow('Invalid source URL');
    });
  });

  describe('installPlugin', () => {
    it('should handle plugin installation errors', async () => {
      const plugin = {
        name: 'test-plugin',
        source: 'https://example.com/nonexistent.tar.gz'
      };

      await expect(installer.installPlugin(plugin))
        .rejects.toThrow();
    });

    it('should apply plugin configuration', async () => {
      const plugin = {
        name: 'test-plugin',
        source: 'https://example.com/plugin.tar.gz',
        config: {
          key: 'value'
        }
      };

      // Mock plugin installation
      installer.pluginManager.install = jest.fn().mockResolvedValue();
      
      await installer.installPlugin(plugin);
      
      const configPath = path.join(tempDir, plugin.name, 'config.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      expect(config).toEqual(plugin.config);
    });
  });

  describe('error handling', () => {
    it('should handle YAML parsing errors', async () => {
      const invalidYaml = `
plugins:
  - name: test-plugin
    source: [invalid yaml
`;
      await fs.writeFile(configPath, invalidYaml);
      
      await expect(installer.installFromConfig(configPath))
        .rejects.toThrow();
    });

    it('should handle file system errors', async () => {
      const plugin = {
        name: 'test-plugin',
        source: 'https://example.com/plugin.tar.gz',
        config: {
          key: 'value'
        }
      };

      // Make plugins directory read-only
      await fs.chmod(tempDir, 0o444);
      
      await expect(installer.installPlugin(plugin))
        .rejects.toThrow();
    });
  });
}); 