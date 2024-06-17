import { loadConfig } from '@/config'

// Export config for .sequelizerc.
module.exports = loadConfig().db
