import { ContractFormula } from '@/core'

export * from './daoPreProposeBase'

export const preProposeApprovalContract: ContractFormula<
  string | undefined
> = async ({ contractAddress, get }) =>
  await get(contractAddress, 'pre_propose_approval_contract')
