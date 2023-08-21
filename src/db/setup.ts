import * as fs from 'fs'
import path from 'path'

import { Sequelize } from 'sequelize'

export const setup = async (sequelize: Sequelize, force = true) => {
  // Add trigram index extension.
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;')
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gin;')

  // Drop all tables and recreate them.
  await sequelize.sync({ force })

  // Add migrations to database.
  const migrations = fs.readdirSync(path.join(__dirname, 'migrations'))
  for (const migration of migrations) {
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" ("name") VALUES ('${migration}');`
    )
  }
}
