const path = require('path');
const fs = require('fs');
const ConfigValidator = require('./config-validator');
const logger = require('./logger');
const { PluginManager } = require('../plugin-management/plugin-management');

class BatchInstaller {
  constructor(pluginsDir = process.env.PLUGINS_DIR || '/headlamp/plugins') {
    this.pluginsDir = pluginsDir;
    this.configValidator = new ConfigValidator();
    this.logger = logger.child({ component: 'BatchInstaller' });
  }

  /**
   * Install plugins from a configuration file
   * @param {string} configPath - Path to the configuration file
   * @returns {Promise<Array>} Array of installation results
   */
  async installFromConfig(configPath) {
    try {
      this.logger.info(`Loading plugin configuration from ${configPath}`);
      const config = this.configValidator.validateConfig(configPath);

      const results = [];
      for (const plugin of config.plugins) {
        try {
          this.logger.info(`Installing plugin: ${plugin.name}`, { plugin });
          await this.installPlugin(plugin);
          results.push({
            name: plugin.name,
            status: 'success',
            message: 'Plugin installed successfully'
          });
        } catch (error) {
          this.logger.error(`Failed to install plugin: ${plugin.name}`, {
            plugin,
            error: error.message,
            stack: error.stack
          });
          results.push({
            name: plugin.name,
            status: 'error',
            message: error.message
          });
        }
      }

      // Log results summary
      const successful = results.filter(r => r.status === 'success').length;
      const failed = results.filter(r => r.status === 'error').length;
      
      this.logger.info('Batch installation completed', {
        total: results.length,
        successful,
        failed
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to process plugin configuration', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Install a single plugin
   * @param {Object} plugin - Plugin configuration
   * @returns {Promise<void>}
   */
  async installPlugin(plugin) {
    const installPath = path.join(this.pluginsDir, plugin.name);

    // Create progress callback for logging
    const progressCallback = (progress) => {
      if (progress.type === 'error') {
        this.logger.error(progress.message, { plugin: plugin.name });
      } else {
        this.logger.info(progress.message, { plugin: plugin.name });
      }
    };

    try {
      // Install new plugin using static method
      await PluginManager.install(
        plugin.source,
        installPath,
        '', // headlamp version - TODO: Add support for version compatibility
        progressCallback
      );

      // Apply plugin configuration if provided
      if (plugin.config) {
        await this.applyPluginConfig(plugin.name, plugin.config);
      }
    } catch (error) {
      this.logger.error(`Failed to install plugin ${plugin.name}`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Apply configuration to an installed plugin
   * @param {string} pluginName - Name of the plugin
   * @param {Object} config - Plugin configuration
   * @returns {Promise<void>}
   */
  async applyPluginConfig(pluginName, config) {
    try {
      const pluginDir = path.join(this.pluginsDir, pluginName);
      // Ensure plugin directory exists
      await fs.promises.mkdir(pluginDir, { recursive: true });
      
      const configPath = path.join(pluginDir, 'config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
      this.logger.info(`Applied configuration to plugin ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to apply configuration to plugin ${pluginName}`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = BatchInstaller; 