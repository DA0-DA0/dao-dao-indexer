import { Block } from '@/core'

export const validateBlockString = (block: string, subject: string): Block => {
  const parsedBlock = block.split(':').map((s) => parseInt(s, 10))

  if (parsedBlock.length !== 2) {
    throw new Error(`${subject} must be a height:timeUnixMs pair`)
  }

  const [blockHeight, blockTimeUnixMs] = parsedBlock
  if (isNaN(blockHeight) || isNaN(blockTimeUnixMs)) {
    throw new Error(`${subject}'s values must be integers`)
  }

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
