import { loadConfig } from '@/core/config'
const { db } = loadConfig()

// Export config for .sequelizerc.
module.exports = db
