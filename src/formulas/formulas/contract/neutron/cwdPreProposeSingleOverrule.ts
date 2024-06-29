import { ContractFormula } from '@/types'

export * from '../prePropose/daoPreProposeBase'

export const overruleProposalId: ContractFormula<
  number,
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

    const id = await get(
      contractAddress,
      'overrule_proposals',
      Number(subdaoProposalId),
      timelockAddress
    )

    if (typeof id !== 'number') {
      throw new Error('faled to get overrule proposal id')
    }

    return id
  },
}
