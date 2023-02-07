import { Secp256k1HdWallet, makeSignDoc } from '@cosmjs/amino'
import { toHex } from '@cosmjs/encoding'

import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
} from '@/db'
import { RequestBody } from '@/server/routes/account/types'

export type GetSignedBody = <Data extends Record<string, unknown>>(
  data: Data
) => Promise<RequestBody<Data>>

const AUTH = {
  type: 'auth',
  chainId: 'test',
  chainFeeDenom: 'test',
  chainBech32Prefix: 'test',
}

// This generates a wallet and matching account, returning functions to interact
// with them.
export const getAccountWithSigner = async () => {
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
  await paidAccountKey.$create<AccountKeyCredit>('credit', {
    paymentSource: AccountKeyCreditPaymentSource.CwReceipt,
    paymentId: 'receipt',
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

  const getSignedBody: GetSignedBody = async (data) => {
    // Reload account to get the latest nonce.
    await account.reload()

    const dataWithAuth = {
      ...data,
      auth: {
        ...AUTH,
        nonce: account.nonce,
        publicKey,
      },
    }

    const signature = (
      await wallet.signAmino(
        address,
        makeSignDoc(
          [
            {
              type: dataWithAuth.auth.type,
              value: {
                signer: address,
                data: JSON.stringify(dataWithAuth, undefined, 2),
              },
            },
          ],
          {
            gas: '0',
            amount: [
              {
                denom: dataWithAuth.auth.chainFeeDenom,
                amount: '0',
              },
            ],
          },
          dataWithAuth.auth.chainId,
          '',
          0,
          0
        )
      )
    ).signature.signature

    return {
      data: dataWithAuth,
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

  return {
    account,
    getSignedBody,

    // Keys.
    paidApiKey,
    paidAccountKey,
    unpaidApiKey,
    unpaidAccountKey,
  }
}
