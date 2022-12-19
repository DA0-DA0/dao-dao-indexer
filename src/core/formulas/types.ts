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
