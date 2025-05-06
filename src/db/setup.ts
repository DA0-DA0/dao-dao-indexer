import { Sequelize } from 'sequelize'

export const setup = async (
  sequelize: Sequelize,
  force = true,
  type: 'data' | 'accounts'
) => {
  if (type === 'data') {
    // Add trigram index extension.
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;')
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gin;')

    // Add timescaledb extension.
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS timescaledb;')
  }

  // Drop all tables and recreate them.
  await sequelize.sync({ force })
}
