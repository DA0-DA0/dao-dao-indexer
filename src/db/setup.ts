import { Sequelize } from 'sequelize'

export const setup = async (sequelize: Sequelize) => {
  // Add trigram index extension.
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;')
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gin;')

  // Drop all tables and recreate them.
  await sequelize.sync({ force: true })
}
