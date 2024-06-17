import { Duration, Expiration } from '../../../types'
import { PercentageThreshold, Status } from '../types'

export interface Votes {
  abstain: string
  no: string
  yes: string
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

export interface SingleChoiceProposal {
  allow_revoting: boolean
  created: string
  description: string
  expiration: Expiration
  last_updated: string
  min_voting_period?: Expiration | null
  msgs: any[]
  proposer: string
  start_height: number
  status: Status
  threshold: Threshold
  title: string
  total_power: string
  votes: Votes
  veto?: VetoConfig | null
}

export interface Ballot {
  power: string
  vote: string
  rationale?: string | null
}

export type VetoConfig = {
  vetoer: string
  timelock_duration: Duration
  early_execute: boolean
  veto_before_passed: boolean
}

export type Config = {
  dao: string
  veto?: VetoConfig | null
}
