import { fromBase64 } from '@cosmjs/encoding'
import {
  ProposalStatus,
  Proposal as ProposalV1,
} from '@dao-dao/types/protobuf/codegen/cosmos/gov/v1/gov'
import { Proposal as ProposalV1Beta1 } from '@dao-dao/types/protobuf/codegen/cosmos/gov/v1beta1/gov'

/**
 * Potentially decode a base64 string for a gov proposal.
 */
export const decodeGovProposal = (
  base64Data: string
): {
  proposal: ProposalV1 | ProposalV1Beta1 | undefined
  title: string
  description: string
  status: ProposalStatus
} => {
  let decoded: ProposalV1 | ProposalV1Beta1 | undefined
  try {
    decoded = ProposalV1.decode(fromBase64(base64Data))
  } catch {
    try {
      decoded = ProposalV1Beta1.decode(fromBase64(base64Data))
    } catch {}
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

  return {
    proposal: decoded,
    title,
    description,
    status,
  }
}
