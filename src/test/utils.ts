import { Secp256k1HdWallet, makeSignDoc } from '@cosmjs/amino'
import { toHex } from '@cosmjs/encoding'

import { dbKeyForKeys } from '@/core/utils'
import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
  AccountWebhook,
  AccountWebhookEvent,
  Contract,
  WasmStateEvent,
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
    amount: 100,
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

export const createContractAndEvent = async (
  blockHeight = 1,
  address = 'contract'
) => {
  const [contract] = await Contract.findOrCreate({
    where: {
      address,
    },
    defaults: {
      codeId: 1,
    },
  })

  const blockTimestamp = new Date()
  const valueJson = { key: 'value' }
  const event = await WasmStateEvent.create({
    contractAddress: contract.address,
    blockHeight: blockHeight.toString(),
    blockTimeUnixMs: blockTimestamp.getTime().toString(),
    blockTimestamp,
    // Unique key for the event to prevent collisions while testing.
    key: dbKeyForKeys('key_set_at', blockTimestamp.toISOString()),
    value: JSON.stringify(valueJson),
    valueJson,
    delete: false,
  })

  return {
    contract,
    event,
  }
}

export const createWebhookWithEvents = async (
  account: Account,
  key: AccountKey,
  eventCount = 1
) => {
  const codeIdSet = await account.$create('codeIdSet', {
    name: 'contract',
    codeIds: [1, 50, 200],
  })

  const webhook = await account.$create<AccountWebhook>('webhook', {
    accountKeyId: key.id,
    description: 'test',
    url: 'https://moonphase.is',
    secret: 'secret',
  })
  await webhook.$add('codeIdSet', codeIdSet)

  // Create webhook events.
  for (let i = 0; i < Math.max(eventCount, 1); i++) {
    const event = await webhook.queue(
      (
        await createContractAndEvent(i + 1)
      ).event
    )
    if (!event) {
      throw new Error('Failed to create webhook event.')
    }
  }

  await webhook.reload({
    include: {
      model: AccountWebhookEvent,
      order: [['createdAt', 'DESC']],
      // So that order works.
      separate: true,
    },
  })

  return webhook
}
