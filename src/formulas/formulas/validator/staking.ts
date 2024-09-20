// import { ValidatorFormula } from '@/types'

// type Slash = {
//   registeredBlockHeight: string
//   registeredBlockTimeUnixMs: string
//   infractionBlockHeight: string
//   slashFactor: string
//   amountSlashed: string
//   effectiveFraction: string
//   stakedTokensBurned: string
// }

// export const slashes: ValidatorFormula<Slash[]> = {
//   docs: {
//     description: 'retrieves slash events for a validator',
//   },
//   compute: async ({ validatorOperatorAddress, getSlashEvents }) =>
//     ((await getSlashEvents(validatorOperatorAddress)) ?? []).map(
//       ({
//         registeredBlockHeight,
//         registeredBlockTimeUnixMs,
//         infractionBlockHeight,
//         slashFactor,
//         amountSlashed,
//         effectiveFraction,
//         stakedTokensBurned,
//       }) => ({
//         registeredBlockHeight,
//         registeredBlockTimeUnixMs,
//         infractionBlockHeight,
//         slashFactor,
//         amountSlashed,
//         effectiveFraction,
//         stakedTokensBurned,
//       })
//     ),
// }
