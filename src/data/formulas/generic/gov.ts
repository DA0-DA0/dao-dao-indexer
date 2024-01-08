import { FormulaProposalObject, GenericFormula } from '@/core'

export const proposal: GenericFormula<
  FormulaProposalObject | undefined,
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
    proposals: FormulaProposalObject[]
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

    // Sort ascending.
    const proposals = ((await getProposals()) || []).sort((a, b) =>
      Number(BigInt(a.id) - BigInt(b.id))
    )

    return {
      proposals: proposals.slice(offsetNum, offsetNum + limitNum),
      total: proposals.length,
    }
  },
}

export const reverseProposals: GenericFormula<
  {
    proposals: FormulaProposalObject[]
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

    // Sort descending.
    const proposals = ((await getProposals()) || []).sort((a, b) =>
      Number(BigInt(b.id) - BigInt(a.id))
    )

    return {
      proposals: proposals.slice(offsetNum, offsetNum + limitNum),
      total: proposals.length,
    }
  },
}
