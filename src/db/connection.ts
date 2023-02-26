import { Sequelize, SequelizeOptions } from 'sequelize-typescript'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'

import {
  Account,
  AccountCodeIdSet,
  AccountKey,
  AccountKeyCredit,
  AccountWebhook,
  AccountWebhookCodeIdSet,
  AccountWebhookEventAttempt,
  Computation,
  Contract,
  Event,
  PendingWebhook,
  State,
  Transformation,
} from './models'
import { AccountWebhookEvent } from './models/AccountWebhookEvent'

// List of models included in the database per type.
const MODELS_FOR_TYPE: Record<DbType, SequelizeOptions['models']> = {
  [DbType.Data]: [
    Computation,
    Contract,
    Event,
    PendingWebhook,
    State,
    Transformation,
  ],
  [DbType.Accounts]: [
    Account,
    AccountCodeIdSet,
    AccountKey,
    AccountKeyCredit,
    AccountWebhook,
    AccountWebhookCodeIdSet,
    AccountWebhookEvent,
    AccountWebhookEventAttempt,
  ],
}

const sequelizeInstances: Partial<Record<DbType, Sequelize>> = {}

type LoadDbOptions = {
  type?: DbType
  logging?: boolean
}

export const loadDb = async ({
  logging = false,
  type = DbType.Data,
}: LoadDbOptions = {}) => {
  if (sequelizeInstances[type]) {
    return sequelizeInstances[type]!
  }

  const { db } = loadConfig()

  const dbConfig = db[type]
  if (!dbConfig) {
    throw new Error(`No database config found for type ${type}`)
  }

  const options: SequelizeOptions = {
    // User config.
    ...dbConfig,

    // Allow options to override logging, but default to false.
    logging: dbConfig.logging ?? logging ? console.log : false,

    // Tell Sequelize what models we have.
    models: MODELS_FOR_TYPE[type],
  }

  // If URI present, use it. Otherwise, use options directly.
  const sequelize = dbConfig.uri
    ? new Sequelize(dbConfig.uri, options)
    : new Sequelize(options)

  try {
    await sequelize.authenticate()
  } catch (error) {
    console.error('Unable to connect to the database:', error)
  }

  // Cache for loading later.
  sequelizeInstances[type] = sequelize

  return sequelize
}

export const closeDb = async () => {
  await Promise.all(
    Object.values(sequelizeInstances).map((sequelize) => sequelize.close())
  )
}
