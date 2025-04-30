import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'
import { Secp256k1, Secp256k1Signature } from '@cosmjs/crypto'
import { fromBase64, fromHex, toBech32 } from '@cosmjs/encoding'
import CryptoJS from 'crypto-js'
import jwt from 'jsonwebtoken'
import { Middleware } from 'koa'

import { ConfigManager } from '@/config'
import { Account } from '@/db'

import { AccountState, AuthRequestBody } from './types'

// Middleware to protect routes with the above function. If it does not return,
// the request is authorized. If successful, the `parsedBody` field will be set
// on the request object, accessible by successive middleware and route
// handlers.
export const authMiddleware: Middleware<AccountState> = async (ctx, next) => {
  const { accountsJwtSecret } = ConfigManager.load()
  if (!accountsJwtSecret) {
    ctx.status = 500
    ctx.body = {
      error: 'JWT not configured.',
    }
    return
  }

  const authorization = ctx.header['authorization']
  if (!authorization) {
    ctx.status = 401
    ctx.body = {
      error: 'No token.',
    }
    return
  }

  const [type, token] = authorization.split(' ')
  if (type !== 'Bearer') {
    ctx.status = 401
    ctx.body = {
      error: 'Invalid token type.',
    }
    return
  }

  // Verify token.
  try {
    const decodedToken = jwt.verify(token, accountsJwtSecret)
    if (
      typeof decodedToken !== 'object' ||
      !decodedToken ||
      !('publicKey' in decodedToken)
    ) {
      throw new Error()
    }

    const account = await Account.findByPk(decodedToken.publicKey)
    if (!account) {
      throw new Error()
    }

    // Set account.
    ctx.state.account = account
  } catch (err) {
    ctx.status = 401
    ctx.body = {
      error: 'Invalid token.',
    }
    return
  }

  // Continue.
  await next()
}

// https://github.com/chainapsis/keplr-wallet/blob/088dc701ce14df77a1ee22b7e39c651e50879d9f/packages/crypto/src/key.ts#L56-L63
const secp256k1PublicKeyToBech32Address = (
  hexPublicKey: string,
  bech32Prefix: string
): string => {
  // https://github.com/cosmos/cosmos-sdk/blob/e09516f4795c637ab12b30bf732ce5d86da78424/crypto/keys/secp256k1/secp256k1.go#L152-L162
  // Cosmos SDK generates address data using RIPEMD160(SHA256(pubkey)).
  const sha256Hash = CryptoJS.SHA256(
    // The `create` function is incorrectly typed to only take a `number[]`
    // type. It can also handle a `Uint8Array` type. Simply converting using
    // `Array.from` does not work because the `WordArray.create` function
    // recognizes that the bytes need to be combined into words when a
    // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
    // type as individual words (i.e. 4-byte numbers) and does not properly
    // combine them.
    CryptoJS.lib.WordArray.create(fromHex(hexPublicKey) as unknown as number[])
  )
  const ripemd160Hash = CryptoJS.RIPEMD160(sha256Hash)

  // Output Bech32 formatted address.
  const addressData = fromHex(ripemd160Hash.toString(CryptoJS.enc.Hex))
  return toBech32(bech32Prefix, addressData)
}

const verifySecp256k1Signature = async (
  hexPublicKey: string,
  message: Uint8Array,
  base64DerSignature: string
): Promise<boolean> => {
  const publicKeyData = fromHex(hexPublicKey)
  const signature = Secp256k1Signature.fromFixedLength(
    fromBase64(base64DerSignature)
  )

  const messageHash = fromHex(
    CryptoJS.SHA256(
      // The `create` function is incorrectly typed to only take a `number[]`
      // type. It can also handle a `Uint8Array` type. Simply converting using
      // `Array.from` does not work because the `WordArray.create` function
      // recognizes that the bytes need to be combined into words when a
      // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
      // type as individual words (i.e. 4-byte numbers) and does not properly
      // combine them.
      CryptoJS.lib.WordArray.create(message as unknown as number[])
    ).toString(CryptoJS.enc.Hex)
  )

  return await Secp256k1.verifySignature(signature, messageHash, publicKeyData)
}

// Verify signature.
export const verifySignature = async ({
  auth,
  signature,
}: AuthRequestBody): Promise<boolean> => {
  try {
    const signer = secp256k1PublicKeyToBech32Address(
      auth.publicKey,
      auth.chainBech32Prefix
    )
    const message = serializeSignDoc(
      makeSignDoc(
        [
          {
            type: auth.type,
            value: {
              signer,
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

    return await verifySecp256k1Signature(auth.publicKey, message, signature)
  } catch (err) {
    console.error('Signature verification', err)
    return false
  }
}
