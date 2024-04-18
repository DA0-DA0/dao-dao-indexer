import { fromBase64 } from '@cosmjs/encoding'

import {
  FormulaDecodedProposalObject,
  FormulaProposalObject,
  GenericFormula,
} from '@/core'
import {
  ProposalStatus,
  Proposal as ProposalV1,
} from '@/protobuf/codegen/cosmos/gov/v1/gov'
import { Proposal as ProposalV1Beta1 } from '@/protobuf/codegen/cosmos/gov/v1beta1/gov'

export const proposal: GenericFormula<
  FormulaProposalObject | undefined,
  { id: string }
> = {
  compute: async ({ getProposal, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    return await getProposal(id)
  },
}

export const decodedProposal: GenericFormula<
  FormulaDecodedProposalObject | undefined,
  { id: string }
> = {
  compute: async ({ getProposal, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    const proposal = await getProposal(id)

    let decoded: ProposalV1 | ProposalV1Beta1 | undefined
    if (proposal) {
      try {
        decoded = ProposalV1.decode(fromBase64(proposal.data))
      } catch {
        try {
          decoded = ProposalV1Beta1.decode(fromBase64(proposal.data))
        } catch {}
      }
    }

    const title = decoded
      ? 'title' in decoded
        ? decoded.title
        : 'content' in decoded && decoded.content
        ? decoded.content.title
        : '<failed to decode>'
      : '<failed to decode>'
    const description = decoded
      ? 'summary' in decoded
        ? decoded.summary
        : 'content' in decoded && decoded.content
        ? decoded.content.description
        : '<failed to decode>'
      : '<failed to decode>'
    const status = decoded?.status || ProposalStatus.UNRECOGNIZED

    return (
      proposal && {
        ...proposal,
        title,
        description,
        status,
        submitTime: decoded?.submitTime?.getTime(),
        depositEndTime: decoded?.depositEndTime?.getTime(),
        votingStartTime: decoded?.votingStartTime?.getTime(),
        votingEndTime: decoded?.votingEndTime?.getTime(),
      }
    )
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
  compute: async ({
    getProposals,
    getProposalCount,
    args: { offset, limit },
  }) => {
    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : undefined

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (limitNum !== undefined && isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    // Sort ascending.
    const proposals = (await getProposals(true, limitNum, offsetNum)) || []

    // Should be cached since all proposals were just fetched above.
    const total = await getProposalCount()

    return {
      proposals,
      total,
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
  compute: async ({
    getProposals,
    getProposalCount,
    args: { offset, limit },
  }) => {
    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : undefined

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (limitNum !== undefined && isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    // Sort descending.
    const proposals = (await getProposals(false, limitNum, offsetNum)) || []

    // Should be cached since all proposals were just fetched above.
    const total = await getProposalCount()

    return {
      proposals,
      total,
    }
  },
}
