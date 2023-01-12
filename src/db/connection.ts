import { Sequelize, SequelizeOptions } from 'sequelize-typescript'

import { loadConfig } from '@/core'

import {
  Account,
  AccountCredit,
  Computation,
  Contract,
  Event,
  PendingWebhook,
  State,
  Transformation,
} from './models'

let sequelize: Sequelize | undefined

// Tell Sequelize to parse int8 as BigInt instead of string.
require('pg').defaults.parseInt8 = true

export const loadDb = async (
  {
    logging,
  }: {
    logging: boolean | undefined
  } = { logging: false }
) => {
  if (sequelize) {
    return sequelize
  }

  const { db } = loadConfig()

  const options: SequelizeOptions = {
    // User config.
    ...db,

    // Allow options to override logging, but default to false.
    logging: db.logging ?? logging ? console.log : false,

    // Tell Sequelize what models we have.
    models: [
      Account,
      AccountCredit,
      Computation,
      Contract,
      Event,
      PendingWebhook,
      State,
      Transformation,
    ],
  }

  // If URI present, use it. Otherwise, use options directly.
  sequelize = db.uri ? new Sequelize(db.uri, options) : new Sequelize(options)

  try {
    await sequelize.authenticate()
  } catch (error) {
    console.error('Unable to connect to the database:', error)
  }

  // Alter the database to match any changes.
  // await sequelize.sync({ alter: true })
  // Drop all tables and recreate them.
  // await sequelize.sync({ force: true })

  return sequelize
}

export const closeDb = async () => {
  await sequelize?.close()
}
