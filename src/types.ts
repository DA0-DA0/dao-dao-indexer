import { SequelizeOptions } from 'sequelize-typescript'

export interface Config {
  indexerRoot: string
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
  preCompute: {
    contractAddresses?: string[]
    codeIds?: number[]
    formulaPrefixes?: string[]
    formulas?: string[]
  }[]
}
