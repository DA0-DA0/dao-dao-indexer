import { ConfigManager } from '@/config'

// Export config for .sequelizerc.
module.exports = ConfigManager.load().db
