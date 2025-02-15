const Ajv = require('ajv');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Plugin configuration schema
const pluginConfigSchema = {
  type: 'object',
  required: ['plugins'],
  properties: {
    plugins: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'source'],
        properties: {
          name: { type: 'string' },
          source: { type: 'string' },
          version: { type: 'string' },
          config: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    }
  }
};

class ConfigValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.validate = this.ajv.compile(pluginConfigSchema);
  }

  /**
   * Load and validate plugin configuration from a YAML file
   * @param {string} configPath - Path to the YAML configuration file
   * @returns {Object} Validated configuration object
   * @throws {Error} If validation fails
   */
  validateConfig(configPath) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);

      const valid = this.validate(config);
      if (!valid) {
        const errors = this.validate.errors.map(err => 
          `${err.instancePath} ${err.message}`
        ).join('\n');
        throw new Error(`Configuration validation failed:\n${errors}`);
      }

      // Additional validation for source URLs and versions
      this.validateSourceUrls(config.plugins);
      this.validateVersions(config.plugins);

      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
      throw error;
    }
  }

  /**
   * Validate plugin source URLs
   * @param {Array} plugins - Array of plugin configurations
   * @throws {Error} If any source URL is invalid
   */
  validateSourceUrls(plugins) {
    for (const plugin of plugins) {
      if (!this.isValidSourceUrl(plugin.source)) {
        throw new Error(`Invalid source URL for plugin ${plugin.name}: ${plugin.source}`);
      }
    }
  }

  /**
   * Validate plugin versions
   * @param {Array} plugins - Array of plugin configurations
   * @throws {Error} If any version is invalid
   */
  validateVersions(plugins) {
    for (const plugin of plugins) {
      if (plugin.version && !this.isValidVersion(plugin.version)) {
        throw new Error(`Invalid version for plugin ${plugin.name}: ${plugin.version}`);
      }
    }
  }

  /**
   * Check if a source URL is valid
   * @param {string} source - Plugin source URL
   * @returns {boolean} True if valid
   */
  isValidSourceUrl(source) {
    try {
      const url = new URL(source);
      // Accept GitHub releases and ArtifactHub URLs
      return url.protocol === 'https:' && (
        (url.hostname === 'github.com' && url.pathname.includes('/releases/download/')) ||
        (url.hostname === 'artifacthub.io' && url.pathname.includes('/packages/'))
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if a Git URL is valid
   * @param {string} url - Git URL
   * @returns {boolean} True if valid
   */
  isValidGitUrl(url) {
    const gitUrlPattern = /^(https?:\/\/|git@)([^\s:]+)(:|\/)[^\s]+$/;
    return gitUrlPattern.test(url);
  }

  /**
   * Check if a version string is valid
   * @param {string} version - Version string
   * @returns {boolean} True if valid
   */
  isValidVersion(version) {
    if (version === 'latest') return true;
    return /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(version);
  }
}

module.exports = ConfigValidator; 