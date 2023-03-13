import { ValidatorFormula } from '@/core'

type Slash = {
  registeredBlockHeight: string
  registeredBlockTimeUnixMs: string
  infractionBlockHeight: string
  slashFactor: string
  amountSlashed: string
}

export const slashes: ValidatorFormula<Slash[]> = {
  compute: async ({ validatorOperatorAddress, getSlashEvents }) =>
    ((await getSlashEvents(validatorOperatorAddress)) ?? []).map(
      ({
        registeredBlockHeight,
        registeredBlockTimeUnixMs,
        infractionBlockHeight,
        slashFactor,
        amountSlashed,
      }) => ({
        registeredBlockHeight,
        registeredBlockTimeUnixMs,
        infractionBlockHeight,
        slashFactor,
        amountSlashed,
      })
    ),
}
