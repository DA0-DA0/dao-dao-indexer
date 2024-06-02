import { ContractFormula } from '@/core'

type SenderInfo = {
  connection_id: String
  remote_port: String
  remote_sender: String
}

export const remoteController: ContractFormula<
  string | undefined,
  { address: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('Missing address')
    }

    return (
      await getTransformationMatch<string>(
        contractAddress,
        `remoteController:${address}`
      )
    )?.value
  },
}

export const senderInfoForProxy: ContractFormula<
  SenderInfo | undefined,
  { address: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('Missing address')
    }

    return (
      await getTransformationMatch<SenderInfo>(
        contractAddress,
        `senderInfo:${address}`
      )
    )?.value
  },
}
