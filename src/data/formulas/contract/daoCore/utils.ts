import { ContractEnv } from '@/core'

import { listSubDaos } from './base'

// Get a list of unique SubDAOs in a DAO's tree of SubDAOs.
export const getUniqueSubDaosInTree = async (
  env: ContractEnv,
  daoAddress: string
): Promise<string[]> => {
  const pendingDaos = new Set([daoAddress])
  const daosSeen = new Set([daoAddress])

  while (pendingDaos.size > 0) {
    const dao = pendingDaos.values().next().value
    pendingDaos.delete(dao)

    // Get SubDAOs.
    const subDaos = await listSubDaos.compute({
      ...env,
      contractAddress: dao,
    })

    // Add to queue if not already added.
    if (subDaos.length > 0) {
      for (const { addr } of subDaos) {
        if (!daosSeen.has(addr)) {
          daosSeen.add(addr)
          pendingDaos.add(addr)
        }
      }
    }
  }

  daosSeen.delete(daoAddress)
  return Array.from(daosSeen)
}
