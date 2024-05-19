export type TargetOverrideStrategy = 'proportional' | 'priority'
export type SignedDecimal = [string, boolean]

export interface ParsedPID {
  d: string
  i: string
  p: string
}

export interface ParsedTarget {
  denom: string
  last_i: SignedDecimal
  last_input?: string | null
  min_balance?: string | null
  percentage: string
}

export interface RebalancerConfig {
  base_denom: string
  has_min_balance: boolean
  last_rebalance: string
  max_limit: string
  pid: ParsedPID
  target_override_strategy: TargetOverrideStrategy
  targets: ParsedTarget[]
  trustee?: string | null
}

export type RebalancerConfigResponse = RebalancerConfig & { is_paused: Boolean }

export interface AccountResponse {
  rebalancerConfig: RebalancerConfigResponse | undefined
}

/****************************************************************************
 * Auctions
 ****************************************************************************/
export type Pair = [string, string]
export type AuctionConfigResponse = AuctionConfig & AuctionStrategy

export interface AuctionConfig {
  chain_halt_config: ChainHaltConfig
  is_paused: boolean
  pair: Pair
  price_freshness_strategy: PriceFreshnessStrategy
}

export interface PriceFreshnessStrategy {
  limit: string
  multipliers: [string, string][]
}

export interface ChainHaltConfig {
  block_avg: string
  cap: number
}

export interface AuctionStrategy {
  end_price_perc: number
  start_price_perc: number
}

export interface AuctionIds {
  curr: number
  next: number
}
