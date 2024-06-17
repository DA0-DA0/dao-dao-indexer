import { ContractFormula } from '@/core/types'

export * from '../prePropose/daoPreProposeBase'

export const overruleProposalId: ContractFormula<
  number | undefined,
  {
    timelockAddress: string
    subdaoProposalId: string
  }
> = {
  compute: async ({
    contractAddress,
    get,
    args: { timelockAddress, subdaoProposalId },
  }) => {
    if (!timelockAddress) {
      throw new Error('missing `timelockAddress`')
    }
    if (!subdaoProposalId) {
      throw new Error('missing `subdaoProposalId`')
    }

    return await get(
      contractAddress,
      'overrule_proposals',
      Number(subdaoProposalId),
      timelockAddress
    )
  },
}
