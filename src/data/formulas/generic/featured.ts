import { GenericFormula } from '@/core'

import { dumpState } from '../contract/daoCore/base'
import featuredDaosList from './featured_daos.json'

export const featuredDaos: GenericFormula = {
  compute: async (env) =>
    (
      await Promise.all(
        featuredDaosList.map(async ({ coreAddress }) => {
          const dumpedState = await dumpState.compute({
            ...env,
            contractAddress: coreAddress,
          })

          return (
            dumpedState && {
              coreAddress,
              ...dumpedState,
            }
          )
        })
      )
    ).filter(Boolean),
}
