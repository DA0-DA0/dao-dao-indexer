import { SequelizeOptions } from 'sequelize-typescript'

export interface Config {
  indexerRoot?: string
  eventsFile?: string
  statusEndpoint: string
  db: { uri?: string } & Pick<
    SequelizeOptions,
    | 'dialect'
    | 'dialectModulePath'
    | 'dialectOptions'
    | 'storage'
    | 'database'
    | 'username'
    | 'password'
    | 'host'
    | 'port'
    | 'ssl'
    | 'protocol'
    | 'pool'
    | 'schema'
  >
  meilisearch?: {
    host: string
    apiKey?: string
    indexes: {
      index: string
      filterableAttributes?: string[]
      formula: string
      args?: Record<string, any>
      // One of these must be present.
      codeIds?: number[]
      contractAddresses?: string[]
    }[]
  }
}
