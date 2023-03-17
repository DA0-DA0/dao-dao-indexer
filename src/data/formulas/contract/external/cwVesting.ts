import { Op, Sequelize } from 'sequelize'

import { ContractFormula, dbKeyToKeys, objectMatchesStructure } from '@/core'

type ValidatorStake = {
  validator: string
  timeMs: number
  // Staked + unstaking
  amount: string
}

type StakeEvent = {
  blockHeight: string
  blockTimeUnixMs: string
} & (
  | {
      type: 'delegate'
      validator: string
      amount: string
    }
  | {
      type: 'undelegate'
      validator: string
      amount: string
    }
  | {
      type: 'redelegate'
      fromValidator: string
      toValidator: string
      amount: string
    }
)

type SlashRegistration = {
  validator: string
  time: string
  amount: string
  duringUnbonding: boolean
}

export const info: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'vesting'),
}

export const unbondingDurationSeconds: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'ubs'),
}

// The amount staked and unstaking for each validator over time.
export const validatorStakes: ContractFormula<ValidatorStake[]> = {
  compute: async ({ contractAddress, getMap }) => {
    const validatorsMap =
      (await getMap(contractAddress, 'validator', {
        keyType: 'raw',
      })) ?? {}

    const validators = Object.entries(validatorsMap)
      .map(([key, amount]): ValidatorStake => {
        const [validator, epoch] = dbKeyToKeys(key, [false, true]) as [
          string,
          number
        ]

        return {
          validator,
          timeMs: epoch * 1000,
          amount,
        }
      })
      // Sort descending by time.
      .sort((a, b) => b.timeMs - a.timeMs)

    return validators
  },
}

// The amount staked and unstaking for each validator over time.
export const stakeHistory: ContractFormula<{
  stakeEvents: StakeEvent[]
  slashRegistrations: SlashRegistration[]
}> = {
  // For now because getTxEvents is not cached.
  dynamic: true,
  compute: async ({ contractAddress, getTxEvents }) => {
    const txEvents =
      (await getTxEvents(contractAddress, {
        [Op.and]: [
          {
            action: 'execute',
          },
          {
            [Op.or]: [
              Sequelize.literal('"msgJson" ? \'delegate\''),
              Sequelize.literal('"msgJson" ? \'undelegate\''),
              Sequelize.literal('"msgJson" ? \'redelegate\''),
              Sequelize.literal('"msgJson" ? \'register_slash\''),
            ],
          },
        ],
      })) ?? []

    const stakeEvents = txEvents
      .map(
        ({ blockHeight, blockTimeUnixMs, msgJson }): StakeEvent | undefined => {
          if (!msgJson) {
            return
          }

          if (
            objectMatchesStructure(msgJson, {
              delegate: {
                amount: {},
                validator: {},
              },
            })
          ) {
            return {
              type: 'delegate',
              validator: msgJson.delegate.validator,
              amount: msgJson.delegate.amount,
              blockHeight,
              blockTimeUnixMs,
            }
          }

          if (
            objectMatchesStructure(msgJson, {
              undelegate: {
                amount: {},
                validator: {},
              },
            })
          ) {
            return {
              type: 'undelegate',
              validator: msgJson.undelegate.validator,
              amount: msgJson.undelegate.amount,
              blockHeight,
              blockTimeUnixMs,
            }
          }

          if (
            objectMatchesStructure(msgJson, {
              redelegate: {
                src_validator: {},
                dst_validator: {},
                amount: {},
              },
            })
          ) {
            return {
              type: 'redelegate',
              fromValidator: msgJson.redelegate.src_validator,
              toValidator: msgJson.redelegate.dst_validator,
              amount: msgJson.redelegate.amount,
              blockHeight,
              blockTimeUnixMs,
            }
          }
        }
      )
      .filter((event): event is StakeEvent => !!event)
      // Sort ascending.
      .sort((a, b) => Number(a.blockHeight) - Number(b.blockHeight))

    const slashRegistrations = txEvents
      .map(({ msgJson }): SlashRegistration | undefined => {
        if (
          objectMatchesStructure(msgJson, {
            register_slash: {
              validator: {},
              time: {},
              amount: {},
              during_unbonding: {},
            },
          })
        ) {
          return {
            validator: msgJson.register_slash.validator,
            time: msgJson.register_slash.time,
            amount: msgJson.register_slash.amount,
            duringUnbonding: msgJson.register_slash.during_unbonding,
          }
        }
      })
      .filter((event): event is SlashRegistration => !!event)
      // Sort ascending.
      .sort((a, b) => Number(a.time) - Number(b.time))

    return {
      stakeEvents,
      slashRegistrations,
    }
  },
}
