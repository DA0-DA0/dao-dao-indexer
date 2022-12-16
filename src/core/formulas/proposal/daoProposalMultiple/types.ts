import { Expiration } from '../../types'
import { PercentageThreshold, Status } from '../types'

export type VotingStrategy = {
  single_choice: {
    quorum: PercentageThreshold
  }
}

export interface MultipleChoiceVote {
  option_id: number
}

export interface VoteInfo {
  power: string
  vote: MultipleChoiceVote
  voter: string
}

export enum MultipleChoiceOptionType {
  Standard = 'standard',
  None = 'none',
}

export interface CheckedMultipleChoiceOption {
  description: string
  index: number
  msgs: any[]
  option_type: MultipleChoiceOptionType
  title: string
  vote_count: string
}

export interface MultipleChoiceVotes {
  vote_weights: string[]
}

export interface MultipleChoiceProposal {
  allow_revoting: boolean
  choices: CheckedMultipleChoiceOption[]
  description: string
  expiration: Expiration
  min_voting_period?: Expiration | null
  proposer: string
  start_height: number
  status: Status
  title: string
  total_power: string
  votes: MultipleChoiceVotes
  voting_strategy: VotingStrategy
}

export interface Ballot {
  power: string
  vote: MultipleChoiceVote
  rationale?: string | null
}
