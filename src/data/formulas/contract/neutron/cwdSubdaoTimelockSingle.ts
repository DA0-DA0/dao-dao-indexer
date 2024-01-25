import { ContractFormula } from '@/core/types'

export const config: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'config'),
}

export const proposal: ContractFormula<any, { id: string }> = {
  compute: async ({ contractAddress, get, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    return await get(contractAddress, 'proposal', id)
  },
}

export const listProposals: ContractFormula<
  any[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async (env) => {
    const {
      contractAddress,
      getMap,
      args: { limit, startAfter },
    } = env

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startAfterNum = startAfter
      ? Math.max(0, Number(startAfter))
      : -Infinity

    const proposals = Object.entries(
      (await getMap<number, any>(contractAddress, 'proposal')) || {}
    )
      // Ascending by proposal ID.
      .sort(([a], [b]) => Number(a) - Number(b))
      .filter(([id]) => Number(id) > startAfterNum)
      .slice(0, limitNum)
      .map(([, proposal]) => proposal)

    return proposals
  },
}

export const proposalExecutionError: ContractFormula<any, { id: string }> = {
  compute: async ({ contractAddress, get, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    return await get(contractAddress, 'proposal_execution_errors', id)
  },
}
