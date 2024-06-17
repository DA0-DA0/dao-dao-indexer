import { ModelStatic, Op } from 'sequelize'

import { getDependableEventModels } from '@/db'
import { Block, DependableEventModel, SerializedBlock } from '@/types'

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
 * Get the first block.
 */
export const getFirstBlock = async (): Promise<Block | undefined> => {
  const events = await Promise.all(
    getDependableEventModels().map((DependableEventModel) =>
      (
        DependableEventModel as unknown as ModelStatic<DependableEventModel>
      ).findOne({
        where: {
          [DependableEventModel.blockHeightKey]: {
            [Op.gt]: 0,
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

export const validateBlockString = (block: string, subject: string): Block => {
  let parsedBlock
  try {
    parsedBlock = block.split(':').map((s) => BigInt(s))
  } catch (err) {
    throw new Error(`${subject}'s values must be integers`)
  }

  if (parsedBlock.length !== 2) {
    throw new Error(`${subject} must be a height:timeUnixMs pair`)
  }

  const [blockHeight, blockTimeUnixMs] = parsedBlock

  if (blockHeight < 1 || blockTimeUnixMs < 0) {
    throw new Error(
      `${subject}'s height must be at least 1 and ${subject}'s timeUnixMs must be at least 0`
    )
  }

  return {
    height: blockHeight,
    timeUnixMs: blockTimeUnixMs,
  }
}

// Stringifies bigint fields.
export const serializeBlock = ({
  height,
  timeUnixMs,
}: Block): SerializedBlock => ({
  height: height.toString(),
  timeUnixMs: timeUnixMs.toString(),
})
