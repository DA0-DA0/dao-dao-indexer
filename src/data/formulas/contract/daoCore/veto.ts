import { ContractFormula } from '@/core'

import { dao } from '../proposal/daoProposalSingle'

type VetoerOfDao = {
  coreAddress: string
  proposalModule: string
}

export const vetoerOf: ContractFormula<VetoerOfDao[]> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMatches } = env

    const proposalModulesWithThisVetoer =
      (
        await getTransformationMatches(undefined, `vetoer:${contractAddress}`)
      )?.map(({ contractAddress }) => contractAddress) || []

    const daos = await Promise.all(
      proposalModulesWithThisVetoer.map((contractAddress) =>
        dao.compute({
          ...env,
          contractAddress,
        })
      )
    )

    return daos.flatMap((coreAddress, index): VetoerOfDao | [] =>
      coreAddress
        ? {
            coreAddress,
            proposalModule: proposalModulesWithThisVetoer[index],
          }
        : []
    )
  },
}
