import { ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'

export * from './daoPreProposeBase'

export const preProposeApprovalContract = makeSimpleContractFormula<string>({
  key: 'pre_propose_approval_contract',
})

export const preProposeApprovalIdForApproverProposalId: ContractFormula<
  number,
  { id: string }
> = {
  compute: async ({ contractAddress, get, args: { id } }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    const proposalId = await get(
      contractAddress,
      'proposal_to_pre_propose',
      Number(id)
    )

    if (typeof proposalId !== 'number') {
      throw new Error('proposal not found')
    }

    return Number(id)
  },
}

export const approverProposalIdForPreProposeApprovalId: ContractFormula<
  number,
  { id: string }
> = {
  compute: async ({ contractAddress, get, args: { id } }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    const proposalId = await get(
      contractAddress,
      'pre_propose_to_proposal',
      Number(id)
    )

    if (typeof proposalId !== 'number') {
      throw new Error('proposal not found')
    }

    return Number(id)
  },
}
