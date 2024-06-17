import { ContractFormula } from '../../../types'

export * from './daoPreProposeBase'

export const preProposeApprovalContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'pre_propose_approval_contract'),
}

export const preProposeApprovalIdForApproverProposalId: ContractFormula<
  number | undefined,
  { id: string }
> = {
  compute: async ({ contractAddress, get, args: { id } }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    return await get(contractAddress, 'proposal_to_pre_propose', Number(id))
  },
}

export const approverProposalIdForPreProposeApprovalId: ContractFormula<
  number | undefined,
  { id: string }
> = {
  compute: async ({ contractAddress, get, args: { id } }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    return await get(contractAddress, 'pre_propose_to_proposal', Number(id))
  },
}
