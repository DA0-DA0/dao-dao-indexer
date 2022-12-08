import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { ComputationOutput } from '../../core/types'
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
  @Column
  blockHeight!: bigint

  @AllowNull(false)
  @Column
  blockTimeUnixMicro!: bigint

  @AllowNull(false)
  @Column(DataType.TEXT)
  formula!: string

  // JSON encoded value.
  @AllowNull(false)
  @Column(DataType.TEXT)
  args!: string

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
      computationOutputs.map(({ blockHeight, blockTimeUnixMicro, value }) => ({
        contractAddress,
        formula,
        args: JSON.stringify(args),
        blockHeight,
        blockTimeUnixMicro,
        output:
          typeof value !== undefined && typeof value !== null
            ? JSON.stringify(value)
            : null,
      })),
      {
        updateOnDuplicate: ['output'],
      }
    )
  }
}
