import { Formula } from '../../types'

export * from './daoPreProposeBase'

export const preProposeApprovalContract: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'pre_propose_approval_contract')
