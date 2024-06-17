import { Expiration } from '../../types'

export type PercentageThreshold =
  | {
      majority: {}
    }
  | {
      percent: string
    }

export enum StatusEnum {
  Open = 'open',
  Rejected = 'rejected',
  Passed = 'passed',
  Executed = 'executed',
  Closed = 'closed',
  ExecutionFailed = 'execution_failed',
  Vetoed = 'vetoed',
}
export type StatusVetoTimelock = {
  veto_timelock: {
    expiration: Expiration
  }
}
export type Status = StatusEnum | StatusVetoTimelock

export interface ProposalResponse<Proposal> {
  id: number
  proposal: Proposal
  // Extra.
  hideFromSearch?: boolean
  dao?: string
  daoProposalId?: string
  createdAt?: string
  completedAt?: string
  executedAt?: string
  closedAt?: string
}

export type ListProposalFilter = 'passed'

export type ProposalCreationPolicy = { anyone: {} } | { module: { addr: {} } }
