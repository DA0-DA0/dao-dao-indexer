import { GenericFormula } from '@/core'

export const proposal: GenericFormula<
  Record<string, any> | undefined,
  { proposalId: string }
> = {
  compute: async ({ getProposal, args: { proposalId } }) => {
    if (!proposalId) {
      throw new Error('missing `proposalId`')
    }

    return await getProposal(proposalId)
  },
}

export const proposals: GenericFormula<
  {
    proposals: Record<string, any>[]
    total: number
  },
  {
    offset?: string
    limit?: string
  }
> = {
  compute: async ({ getProposals, args: { offset, limit } }) => {
    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    const proposals = (await getProposals()) || {}

    // Sort ascending.
    const proposalIds = Object.keys(proposals).sort((a, b) =>
      Number(BigInt(a) - BigInt(b))
    )

    return {
      proposals: proposalIds
        .slice(offsetNum, offsetNum + limitNum)
        .map((proposalId) => proposals[proposalId]),
      total: proposalIds.length,
    }
  },
}

export const reverseProposals: GenericFormula<
  {
    proposals: Record<string, any>[]
    total: number
  },
  {
    offset?: string
    limit?: string
  }
> = {
  compute: async ({ getProposals, args: { offset, limit } }) => {
    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    const proposals = (await getProposals()) || {}

    // Sort descending.
    const proposalIds = Object.keys(proposals).sort((a, b) =>
      Number(BigInt(b) - BigInt(a))
    )

    return {
      proposals: proposalIds
        .slice(offsetNum, offsetNum + limitNum)
        .map((proposalId) => proposals[proposalId]),
      total: proposalIds.length,
    }
  },
}
