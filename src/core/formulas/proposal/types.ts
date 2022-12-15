import { Expiration } from '../types'

export type PercentageThreshold =
  | {
      majority: {}
    }
  | {
      percent: string
    }

export type Threshold =
  | {
      absolute_percentage: {
        percentage: PercentageThreshold
      }
    }
  | {
      threshold_quorum: {
        quorum: PercentageThreshold
        threshold: PercentageThreshold
      }
    }
  | {
      absolute_count: {
        threshold: string
      }
    }

export interface Votes {
  abstain: string
  no: string
  yes: string
}

export enum Status {
  Open = 'open',
  Rejected = 'rejected',
  Passed = 'passed',
  Executed = 'executed',
  Closed = 'closed',
  ExecutionFailed = 'execution_failed',
}

export interface Proposal {
  min_voting_period: Expiration | null
  expiration: Expiration
  threshold: Threshold
  total_power: string
  status: Status
  votes: Votes
  allow_revoting: boolean

  // Other fields not relevant to any formulas.
  [key: string]: any
}

export interface ProposalResponse {
  id: number
  proposal: Proposal
  createdAt?: string
}

export interface Ballot {
  power: string
  vote: string
  rationale: string | null
}

export interface VoteInfo extends Ballot {
  voter: string
  votedAt?: string
}
