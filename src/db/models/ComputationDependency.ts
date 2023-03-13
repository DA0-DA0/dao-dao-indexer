import { Sequelize } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { ComputationDependentKey } from '@/core/types'

import { Computation } from './Computation'

@Table({
  timestamps: true,
  indexes: [
    // No need for more than one row for a given (computation, key, prefix).
    {
      unique: true,
      fields: ['computationId', 'key', 'prefix'],
    },
    {
      // Speeds up queries. Use trigram index for string key to speed up partial
      // matches (LIKE).
      fields: [Sequelize.literal('key gin_trgm_ops')],
      concurrently: true,
      using: 'gin',
    },
    {
      // Speeds up queries.
      fields: ['prefix'],
    },
  ],
})
export class ComputationDependency extends Model {
  @AllowNull(false)
  @ForeignKey(() => Computation)
  @Column
  computationId!: number

  @BelongsTo(() => Computation)
  computation!: Computation

  @AllowNull(false)
  @Column(DataType.TEXT)
  key!: string

  // If true, the computation depends on all keys that start with the given key.
  // This is used with maps for example, where the computation depends on all
  // keys that start with the map prefix.
  @AllowNull(false)
  @Default(false)
  @Column
  prefix!: boolean

  get dependentKey(): ComputationDependentKey {
    return {
      key: this.key,
      prefix: this.prefix,
    }
  }
}
