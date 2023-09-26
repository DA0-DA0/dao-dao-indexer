import { Op } from 'sequelize'

import { BankStateEvent, WasmStateEvent } from '@/db'

import { Block } from '../types'

export const getBlockForTime = async (
  blockTimeUnixMs: bigint
): Promise<Block | undefined> => {
  const [wasmEvent, bankEvent] = await Promise.all([
    await WasmStateEvent.findOne({
      where: {
        blockTimeUnixMs: {
          [Op.gt]: 0,
          [Op.lte]: blockTimeUnixMs,
        },
      },
      order: [['blockTimeUnixMs', 'DESC']],
    }),
    await BankStateEvent.findOne({
      where: {
        blockTimeUnixMs: {
          [Op.gt]: 0,
          [Op.lte]: blockTimeUnixMs,
        },
      },
      order: [['blockTimeUnixMs', 'DESC']],
    }),
  ])

  // Choose latest block.
  return [
    ...(wasmEvent ? [wasmEvent.block] : []),
    ...(bankEvent ? [bankEvent.block] : []),
  ].sort((a, b) => Number(b.height - a.height))[0]
}

export const getFirstBlock = async (): Promise<Block | undefined> => {
  const [wasmEvent, bankEvent] = await Promise.all([
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
  ])

  // Choose latest block.
  return [
    ...(wasmEvent ? [wasmEvent.block] : []),
    ...(bankEvent ? [bankEvent.block] : []),
  ].sort((a, b) => Number(b.height - a.height))[0]
}
