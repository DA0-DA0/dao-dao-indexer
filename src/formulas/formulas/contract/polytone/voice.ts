import { ContractFormula } from '@/types'

type SenderInfo = {
  connection_id: String
  remote_port: String
  remote_sender: String
}

export const remoteController: ContractFormula<string, { address: string }> = {
  docs: {
    description: 'retrieves the remote controller for a given address',
    args: [
      {
        name: 'address',
        description: 'address to get the remote controller for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    const remoteController = (
      await getTransformationMatch<string>(
        contractAddress,
        `remoteController:${address}`
      )
    )?.value

    if (!remoteController) {
      throw new Error('remote controller not found')
    }

    return remoteController
  },
}

export const senderInfoForProxy: ContractFormula<
  SenderInfo,
  { address: string }
> = {
  docs: {
    description: 'retrieves sender information for a proxy address',
    args: [
      {
        name: 'address',
        description: 'proxy address to get sender information for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    const senderInfo = (
      await getTransformationMatch<SenderInfo>(
        contractAddress,
        `senderInfo:${address}`
      )
    )?.value

    if (!senderInfo) {
      throw new Error('sender info not found')
    }

    return senderInfo
  },
}
