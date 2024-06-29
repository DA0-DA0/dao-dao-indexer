import { ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'

export const proposalModule = makeSimpleContractFormula<string>({
  key: 'proposal_module',
})

export const dao = makeSimpleContractFormula<string>({
  key: 'dao',
})

export const config = makeSimpleContractFormula<any>({
  key: 'config',
})

export const depositInfo: ContractFormula<any, { proposalId: string }> = {
  compute: async ({ contractAddress, get, args: { proposalId } }) => {
    if (!proposalId) {
      throw new Error('missing `proposalId`')
    }

    const data = await get<[any, string]>(
      contractAddress,
      'deposits',
      Number(proposalId)
    )

    if (!data || !Array.isArray(data) || data.length !== 2) {
      throw new Error('invalid proposal ID or deposit info')
    }

    return {
      deposit_info: data[0],
      proposer: data[1],
    }
  },
}
