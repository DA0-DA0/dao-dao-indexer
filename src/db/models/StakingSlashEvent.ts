import { Op, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript'

import { Block, ComputationDependentKey, getDependentKey } from '@/core'

import { DependendableEventModel, DependentKeyNamespace } from '../types'
import { Validator } from './Validator'

@Table({
  timestamps: true,
  indexes: [
    // This unique index is used to ensure that we don't duplicate events during
    // export or re-export. Validators are jailed when a slash occurs, so they
    // won't be slashed multiple times for the same infraction.
    {
      unique: true,
      fields: [
        'validatorOperatorAddress',
        'registeredBlockHeight',
        'infractionBlockHeight',
      ],
    },
    {
      // Speed up ordering queries.
      fields: ['registeredBlockHeight'],
    },
    {
      // Speed up ordering queries.
      fields: ['registeredBlockTimeUnixMs'],
    },
  ],
})
export class StakingSlashEvent extends DependendableEventModel {
  @AllowNull(false)
  @ForeignKey(() => Validator)
  @Column
  validatorOperatorAddress!: string

  @BelongsTo(() => Validator)
  validator!: Validator

  @AllowNull(false)
  @Column(DataType.BIGINT)
  registeredBlockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  registeredBlockTimeUnixMs!: string

  @AllowNull(false)
  @Column(DataType.DATE)
  registeredBlockTimestamp!: Date

  @AllowNull(false)
  @Column(DataType.BIGINT)
  infractionBlockHeight!: string

  @AllowNull(false)
  @Column(DataType.STRING)
  slashFactor!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  amountSlashed!: string

  @AllowNull(false)
  @Column(DataType.STRING)
  effectiveFraction!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  stakedTokensBurned!: string

  get block(): Block {
    return {
      height: BigInt(this.registeredBlockHeight),
      timeUnixMs: BigInt(this.registeredBlockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      StakingSlashEvent.dependentKeyNamespace,
      this.validatorOperatorAddress,
      this.registeredBlockHeight,
      this.infractionBlockHeight
    )
  }

  static dependentKeyNamespace = DependentKeyNamespace.StakingSlash
  static blockHeightKey: string = 'registeredBlockHeight'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    const dependentKeysByValidator = dependentKeys.reduce(
      (acc, { key }) => {
        const dependentKey = key.replace(
          new RegExp(`^${this.dependentKeyNamespace}:`),
          ''
        )

        const [
          validatorOperatorAddress,
          registeredBlockHeight,
          infractionBlockHeight,
        ] = dependentKey.split(':')

        return {
          ...acc,
          [validatorOperatorAddress]: [
            ...(acc[validatorOperatorAddress] ?? []),
            {
              registeredBlockHeight,
              infractionBlockHeight,
            },
          ],
        }
      },
      {} as Record<
        string,
        {
          registeredBlockHeight: string | undefined
          infractionBlockHeight: string | undefined
        }[]
      >
    )

    return {
      [Op.or]: Object.entries(dependentKeysByValidator).map(
        ([
          validatorOperatorAddress,
          infractionBlockHeightsAndBlockHeights,
        ]) => ({
          validatorOperatorAddress,
          // Related logic in `makeComputationDependencyWhere` in
          // `src/db/utils.ts`.
          [Op.or]: infractionBlockHeightsAndBlockHeights.map(
            ({ registeredBlockHeight, infractionBlockHeight }) => ({
              // Exact and wildcard matches.
              ...(!registeredBlockHeight || registeredBlockHeight === '*'
                ? {}
                : { registeredBlockHeight }),
              // Exact and wildcard matches.
              ...(!infractionBlockHeight || infractionBlockHeight === '*'
                ? {}
                : { infractionBlockHeight }),
            })
          ),
        })
      ),
    }
  }
}
