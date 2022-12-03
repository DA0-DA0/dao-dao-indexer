import { SequelizeOptions } from 'sequelize-typescript'

export interface Config {
  filter?: {
    codeIds?: number[]
    contractAddresses?: string[]
  }
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
}
