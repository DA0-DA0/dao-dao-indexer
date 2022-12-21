import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Block, ComputationOutput } from '../../core/types'
import { Contract } from './Contract'

@Table({
  timestamps: true,
  indexes: [
    // Formulas are deterministic, so only one output can exist for a formula
    // with args on a contract at a given block height.
    {
      unique: true,
      fields: ['blockHeight', 'contractAddress', 'formula', 'args'],
    },
  ],
})
export class Computation extends Model {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress!: string

  @BelongsTo(() => Contract)
  contract!: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: number

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: number

  @AllowNull(false)
  @Column(DataType.TEXT)
  formula!: string

  // JSON encoded value.
  @AllowNull(false)
  @Column(DataType.TEXT)
  args!: string

  // This formula may depend on keys in other contracts, so we need to include
  // contractAddress for each key. If the key ends with a comma, it is a map
  // prefix. Format: "contractAddress:key"[]
  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.TEXT))
  dependentKeys!: string[]

  // JSON encoded value.
  @AllowNull
  @Column(DataType.TEXT)
  output!: string | null

  public static async createFromComputationOutputs(
    contractAddress: string,
    formula: string,
    args: Record<string, any>,
    ...computationOutputs: ComputationOutput[]
  ) {
    await Computation.bulkCreate(
      computationOutputs.map(({ block, value, dependentKeys }) => ({
        contractAddress,
        formula,
        args: JSON.stringify(args),
        dependentKeys,
        // If no block, the computation must not have accessed any keys. It may
        // be a constant formula, in which case it doesn't have any block
        // context and should thus use an invalid block below the first possible
        // block in case the formula is used in another computation that does
        // access keys.
        blockHeight: block?.height ?? -1,
        blockTimeUnixMs: block?.timeUnixMs ?? -1,
        output:
          typeof value !== undefined && typeof value !== null
            ? JSON.stringify(value)
            : null,
      })),
      {
        updateOnDuplicate: ['dependentKeys', 'output'],
      }
    )
  }

  get block(): Block {
    return {
      height: this.blockHeight,
      timeUnixMs: this.blockTimeUnixMs,
    }
  }
}
