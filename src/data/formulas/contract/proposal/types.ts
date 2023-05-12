export type PercentageThreshold =
  | {
      majority: {}
    }
  | {
      percent: string
    }

export enum Status {
  Open = 'open',
  Rejected = 'rejected',
  Passed = 'passed',
  Executed = 'executed',
  Closed = 'closed',
  ExecutionFailed = 'execution_failed',
}

export interface ProposalResponse<Proposal> {
  id: number
  proposal: Proposal
  // Extra.
  createdAt?: string
  completedAt?: string
  executedAt?: string
  closedAt?: string
}

export type ListProposalFilter = 'passed'
