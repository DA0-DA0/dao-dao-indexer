import { loadConfig } from '@/core/config'
const { db } = loadConfig()

// Add logging when running migrations.
const MIGRATING_DB = process.env.MIGRATING_DB === 'true'
if (MIGRATING_DB) {
  db.data.logging = true
  db.accounts.logging = true
}

// Export config for .sequelizerc.
module.exports = db
