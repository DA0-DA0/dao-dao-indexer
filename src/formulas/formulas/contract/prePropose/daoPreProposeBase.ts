import { ContractFormula } from '../../../types'

export const proposalModule: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'proposal_module'),
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'dao'),
}

export const config: ContractFormula<any | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'config'),
}

export const depositInfo: ContractFormula<
  any | undefined,
  { proposalId: string }
> = {
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
      return
    }

    return {
      deposit_info: data[0],
      proposer: data[1],
    }
  },
}
