import fs from 'fs'
import path from 'path'

import { Sequelize, SequelizeOptions } from 'sequelize-typescript'

import { ConfigManager } from '@/config'
import { DbType } from '@/types'
import { objectMatchesStructure } from '@/utils'

import {
  Account,
  AccountCodeIdSet,
  AccountKey,
  AccountKeyCredit,
  AccountWebhook,
  AccountWebhookCodeIdSet,
  AccountWebhookEvent,
  AccountWebhookEventAttempt,
  BankBalance,
  BankStateEvent,
  Computation,
  ComputationDependency,
  Contract,
  DistributionCommunityPoolStateEvent,
  GovProposal,
  GovProposalVote,
  StakingSlashEvent,
  State,
  Validator,
  WasmCodeKey,
  WasmCodeKeyId,
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
        BankBalance,
        BankStateEvent,
        Computation,
        ComputationDependency,
        Contract,
        DistributionCommunityPoolStateEvent,
        GovProposal,
        GovProposalVote,
        StakingSlashEvent,
        State,
        Validator,
        WasmCodeKey,
        WasmCodeKeyId,
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

  const { db } = ConfigManager.load()

  const dbConfig = db[type]
  if (!dbConfig) {
    throw new Error(`No database config found for type ${type}`)
  }

  const options: SequelizeOptions = {
    // User config.
    ...dbConfig,

    // Allow options to override logging, but default to false.
    logging: dbConfig.logging ?? logging ? console.log : false,
    benchmark: dbConfig.logging ?? logging ? true : false,

    // Tell Sequelize what models we have.
    models: getModelsForType(type),
  }

  // Read the SSL CA certificate file if present.
  if (
    objectMatchesStructure(dbConfig, {
      dialectOptions: {
        ssl: {
          ca: {},
        },
      },
    })
  ) {
    const ca = (dbConfig.dialectOptions as any).ssl.ca
    if (ca && typeof ca === 'string' && !ca.includes('BEGIN CERTIFICATE')) {
      // If file, read it.
      const file = path.resolve(ca)
      if (fs.existsSync(file)) {
        ;(options.dialectOptions as any).ssl.ca = fs
          .readFileSync(file)
          .toString()
      }
    }
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
