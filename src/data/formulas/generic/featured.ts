import { GenericFormula } from '@/core'

import { dumpState } from '../contract/dao/daoCore'
import featuredDaosList from './featured_daos.json'

export const featuredDaos: GenericFormula = async (env) =>
  (
    await Promise.all(
      featuredDaosList.map(async ({ coreAddress }) => {
        const dumpedState = await dumpState({
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
  ).filter(Boolean)
