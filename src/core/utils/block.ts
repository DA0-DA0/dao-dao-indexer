import { ModelStatic, Op } from 'sequelize'

import {
  BankStateEvent,
  DependableEventModel,
  GovStateEvent,
  WasmStateEvent,
  getDependableEventModels,
} from '@/db'

import { Block } from '../types'

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

export const getFirstBlock = async (): Promise<Block | undefined> => {
  const [wasmEvent, bankEvent, govEvent] = await Promise.all([
    await WasmStateEvent.findOne({
      where: {
        blockTimeUnixMs: {
          [Op.gt]: 0,
        },
      },
      order: [['blockTimeUnixMs', 'ASC']],
    }),
    await BankStateEvent.findOne({
      where: {
        blockTimeUnixMs: {
          [Op.gt]: 0,
        },
      },
      order: [['blockTimeUnixMs', 'ASC']],
    }),
    await GovStateEvent.findOne({
      where: {
        blockTimeUnixMs: {
          [Op.gt]: 0,
        },
      },
      order: [['blockTimeUnixMs', 'ASC']],
    }),
  ])

  // Choose latest block.
  return [
    ...(wasmEvent ? [wasmEvent.block] : []),
    ...(bankEvent ? [bankEvent.block] : []),
    ...(govEvent ? [govEvent.block] : []),
  ].sort((a, b) => Number(b.height - a.height))[0]
}
