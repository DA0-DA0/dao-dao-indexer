import { Account } from '@/db'

export type Auth = {
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKey: string
}

export type AuthRequestBody = {
  auth: Auth
  signature: string
}

export type AccountState = {
  account: Account
}
