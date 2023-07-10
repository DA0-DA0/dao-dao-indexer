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
  AccountWebhookEvent,
  AccountWebhookEventAttempt,
  Computation,
  ComputationDependency,
  Contract,
  PendingWebhook,
  StakingSlashEvent,
  State,
  Validator,
  WasmStateEvent,
  WasmStateEventTransformation,
  WasmTxEvent,
} from './models'

const sequelizeInstances: Partial<Record<DbType, Sequelize>> = {}

type LoadDbOptions = {
  type?: DbType
  logging?: boolean
}

// List of models included in the database per type. Load in function to avoid
// circular dependencies making these undefined.
const getModelsForType = (type: DbType): SequelizeOptions['models'] =>
  type === DbType.Data
    ? [
        Computation,
        ComputationDependency,
        Contract,
        PendingWebhook,
        StakingSlashEvent,
        State,
        Validator,
        WasmStateEvent,
        WasmStateEventTransformation,
        WasmTxEvent,
      ]
    : type === DbType.Accounts
    ? [
        Account,
        AccountCodeIdSet,
        AccountKey,
        AccountKeyCredit,
        AccountWebhook,
        AccountWebhookCodeIdSet,
        AccountWebhookEvent,
        AccountWebhookEventAttempt,
      ]
    : []

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
    models: getModelsForType(type),
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
