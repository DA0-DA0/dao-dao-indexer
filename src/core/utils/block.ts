import { ModelStatic, Op } from 'sequelize'

import { DependableEventModel, getDependableEventModels } from '@/db'

import { Block } from '../types'

/**
 * Get the latest block before or equal to the requested block height.
 */
export const getBlockForHeight = async (
  blockHeight: bigint,
  // Optionally set a minimum.
  after = 0n
): Promise<Block | undefined> => {
  const events = await Promise.all(
    getDependableEventModels().map((DependableEventModel) =>
      (
        DependableEventModel as unknown as ModelStatic<DependableEventModel>
      ).findOne({
        where: {
          [DependableEventModel.blockHeightKey]: {
            [Op.gt]: after,
            [Op.lte]: blockHeight,
          },
        },
        order: [[DependableEventModel.blockHeightKey, 'DESC']],
      })
    )
  )

  // Choose latest block.
  return events
    .flatMap((event) => event?.block || [])
    .sort((a, b) => Number(b.height - a.height))[0]
}

/**
 * Get the latest block before or equal to the requested block time.
 */
export const getBlockForTime = async (
  blockTimeUnixMs: bigint,
  // Optionally set a minimum.
  after = 0n
): Promise<Block | undefined> => {
  const events = await Promise.all(
    getDependableEventModels().map((DependableEventModel) =>
      (
        DependableEventModel as unknown as ModelStatic<DependableEventModel>
      ).findOne({
        where: {
          [DependableEventModel.blockTimeUnixMsKey]: {
            [Op.gt]: after,
            [Op.lte]: blockTimeUnixMs,
          },
        },
        order: [[DependableEventModel.blockTimeUnixMsKey, 'DESC']],
      })
    )
  )

  // Choose latest block.
  return events
    .flatMap((event) => event?.block || [])
    .sort((a, b) => Number(b.height - a.height))[0]
}

/**
 * Get the next block after the requested block height.
 */
export const getNextBlockForHeight = async (
  blockHeight: bigint
): Promise<Block | undefined> => {
  const events = await Promise.all(
    getDependableEventModels().map((DependableEventModel) =>
      (
        DependableEventModel as unknown as ModelStatic<DependableEventModel>
      ).findOne({
        where: {
          [DependableEventModel.blockHeightKey]: {
            [Op.gt]: blockHeight,
          },
        },
        order: [[DependableEventModel.blockHeightKey, 'ASC']],
      })
    )
  )

  // Choose first block.
  return events
    .flatMap((event) => event?.block || [])
    .sort((a, b) => Number(a.height - b.height))[0]
}

/**
 * Get the next block after the requested block time.
 */
export const getNextBlockForTime = async (
  blockTimeUnixMs: bigint
): Promise<Block | undefined> => {
  const events = await Promise.all(
    getDependableEventModels().map((DependableEventModel) =>
      (
        DependableEventModel as unknown as ModelStatic<DependableEventModel>
      ).findOne({
        where: {
          [DependableEventModel.blockTimeUnixMsKey]: {
            [Op.gt]: blockTimeUnixMs,
          },
        },
        order: [[DependableEventModel.blockTimeUnixMsKey, 'ASC']],
      })
    )
  )

  // Choose first block.
  return events
    .flatMap((event) => event?.block || [])
    .sort((a, b) => Number(a.height - b.height))[0]
}

export const getFirstBlock = async (): Promise<Block | undefined> => {
  const events = await Promise.all(
    getDependableEventModels().map((DependableEventModel) =>
      (
        DependableEventModel as unknown as ModelStatic<DependableEventModel>
      ).findOne({
        where: {
          [DependableEventModel.blockTimeUnixMsKey]: {
            [Op.gt]: 0,
          },
        },
        order: [[DependableEventModel.blockTimeUnixMsKey, 'ASC']],
      })
    )
  )

  // Choose first block.
  return events
    .flatMap((event) => event?.block || [])
    .sort((a, b) => Number(a.height - b.height))[0]
}
