import { Secp256k1HdWallet, makeSignDoc } from '@cosmjs/amino'
import { toHex } from '@cosmjs/encoding'

import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
} from '@/db'
import { AuthRequestBody } from '@/server/routes/account/types'

export type GetAuth = () => Promise<AuthRequestBody>

const AUTH = {
  type: 'auth',
  chainId: 'test',
  chainFeeDenom: 'test',
  chainBech32Prefix: 'test',
}

// This generates a wallet and matching account, returning functions to interact
// with them.
export const getAccountWithAuth = async () => {
  const wallet = await Secp256k1HdWallet.generate(undefined, {
    prefix: AUTH.chainBech32Prefix,
  })
  const [{ address, pubkey }] = await wallet.getAccounts()
  const publicKey = toHex(pubkey)

  const account = await Account.create({
    publicKey,
  })

  // Generate new key defaulted to having a not paid-for credit.
  const { apiKey: paidApiKey, accountKey: paidAccountKey } =
    await account.generateKey({
      name: 'key1',
      description: null,
    })

  // Add another credit for the key, but paid-for.
  const paidCredit = await paidAccountKey.$create<AccountKeyCredit>('credit', {
    paymentSource: AccountKeyCreditPaymentSource.CwReceipt,
    paymentId: 'receipt ' + publicKey,
    paidAt: new Date(),
    amount: 10,
    used: 0,
    hits: 0,
  })

  // Add another key with only the not paid-for credit.
  const { apiKey: unpaidApiKey, accountKey: unpaidAccountKey } =
    await account.generateKey({
      name: 'key2',
      description: null,
    })

  const getAuth: GetAuth = async () => {
    // Reload account to get the latest nonce.
    await account.reload()

    const auth = {
      ...AUTH,
      nonce: account.nonce,
      publicKey,
    }

    const signature = (
      await wallet.signAmino(
        address,
        makeSignDoc(
          [
            {
              type: auth.type,
              value: {
                signer: address,
                data: JSON.stringify(auth, undefined, 2),
              },
            },
          ],
          {
            gas: '0',
            amount: [
              {
                denom: auth.chainFeeDenom,
                amount: '0',
              },
            ],
          },
          auth.chainId,
          '',
          0,
          0
        )
      )
    ).signature.signature

    return {
      auth,
      signature,
    }
  }

  // Load associations.
  await account.reload({
    include: [
      {
        model: AccountKey,
        include: [
          {
            model: AccountKeyCredit,
          },
        ],
      },
    ],
  })
  await paidAccountKey.reload({
    include: AccountKeyCredit,
  })
  await unpaidAccountKey.reload({
    include: AccountKeyCredit,
  })

  const token = account.getAuthToken()

  return {
    account,
    token,
    getAuth,

    // Keys.
    paidApiKey,
    paidAccountKey,
    paidCredit,
    unpaidApiKey,
    unpaidAccountKey,
  }
}
