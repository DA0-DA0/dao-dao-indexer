import { ContractFormula } from '@/core/types'

import { ProposalCreationPolicy } from './types'

export const creationPolicy: ContractFormula<
  ProposalCreationPolicy | undefined
> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'creation_policy'),
}
