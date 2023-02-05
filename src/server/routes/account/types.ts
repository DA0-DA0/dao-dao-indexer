import { Account } from '@/db'

export type Auth = {
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKey: string
}

export type RequestBody<
  Data extends Record<string, unknown> = Record<string, never>
> = {
  data: {
    auth: Auth
  } & Data
  signature: string
}

export type AccountState<
  Data extends Record<string, unknown> = Record<string, never>
> = {
  account: Account
  data: RequestBody<Data>['data']
}
