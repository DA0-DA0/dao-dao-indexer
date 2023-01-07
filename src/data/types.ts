export type Expiration =
  | {
      at_height: number
    }
  | {
      at_time: string
    }
  | {
      never: {}
    }

export interface ContractInfo {
  contract: string
  version: string
}

export type Denom =
  | {
      native: string
    }
  | {
      cw20: string
    }

export interface ProposalModule {
  address: string
  prefix: string
  status: 'Enabled' | 'Disabled'
}

export type VoteCast<Vote = any> = {
  voter: string
  vote: Vote
  votedAt: string
}

export type VoteInfo<Vote = any> = Omit<VoteCast, 'vote'> & Vote
