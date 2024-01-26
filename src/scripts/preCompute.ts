import { Command } from 'commander'

import {
  Block,
  bigIntMin,
  computeRange,
  getBlockForHeight,
  getFirstBlock,
  loadConfig,
  validateBlockString,
} from '@/core'
import { getTypedFormula } from '@/data'
import { Computation, Contract, State, loadDb } from '@/db'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.requiredOption('-t, --type <formula type>', 'formula type to compute')
  program.requiredOption('-f, --formula <formula>', 'formula name to compute')
  program.option('-a, --args <args>', 'JSON args to pass to formula', '{}')
  program.option(
    '-t, --targets <addresses>',
    'comma-separated list of target addresses',
    (value) => value.split(',')
  )
  program.option(
    '-i, --ids <code IDs>',
    'comma-separated list of code IDs',
    (value) => value.split(',').map((id) => parseInt(id, 10))
  )
  program.option(
    '-s, --start <blockHeight:timeUnixMs>',
    'block to start computing from (defaults to earliest block)'
  )
  program.option(
    '-e, --end <blockHeight:timeUnixMs>',
    'block to end computing at (defaults to latest block)'
  )
  program.option(
    '-b, --batch <size>',
    'batch size for computing (defaults to 100,000)',
    (value) => parseInt(value, 10),
    500000
  )
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.parse()
  const options = program.opts()

  // Load config with config option.
  loadConfig(options.config)

  let args: Record<string, any> = {}
  if (options.args) {
    if (
      typeof options.args !== 'string' ||
      !options.args.trimStart().startsWith('{')
    ) {
      throw new Error(`Invalid JSON args: ${options.args}`)
    }

    try {
      args = JSON.parse(options.args)
    } catch (err) {
      throw new Error(`Invalid JSON args: ${options.args}. ${err}`)
    }
  }

  const sequelize = await loadDb()
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('No state found.')
  }

  let addresses: string[]

  if (options.targets) {
    addresses = options.targets
  } else if (options.ids?.length) {
    addresses = (
      await Contract.findAll({
        where: {
          codeId: options.ids,
        },
      })
    ).map((contract) => contract.address)
  } else {
    throw new Error('Must specify either target addresses or code IDs.')
  }

  if (addresses.length === 0) {
    throw new Error('No addresses found.')
  }

  const blockStart: Block | undefined = options.start
    ? validateBlockString(options.start, 'start')
    : await getFirstBlock()

  // If blockStart undefined, no events found.
  if (!blockStart) {
    throw new Error('No events found.')
  }

  const blockEnd: Block | undefined = options.end
    ? validateBlockString(options.end, 'end')
    : state?.latestBlock

  // If blockEnd undefined, no state found.
  if (!blockEnd) {
    throw new Error('No state found.')
  }

  const typedFormula = getTypedFormula(options.type, options.formula)

  const initialStart = new Date()
  console.log(
    `[${initialStart.toLocaleString()}] Computing ${
      options.formula
    } (with args ${JSON.stringify(
      args
    )}) for ${addresses.length.toLocaleString()} address${
      addresses.length === 1 ? '' : 'es'
    } from ${blockStart.height} to ${blockEnd.height}:`
  )
  addresses.forEach((address) => console.log(`  - ${address}`))
  console.log()

  let computations = 0
  for (const targetAddress of addresses) {
    const start = new Date()
    console.log(`[${start.toLocaleString()}] Computing ${targetAddress}...`)

    // Loop in batches.
    let count = 0
    let block = blockStart
    let i = 1
    while (block.height <= blockEnd.height) {
      const endBlockHeight = bigIntMin(
        block.height + BigInt(options.batch),
        blockEnd.height + 1n
      )
      const endBlock = await getBlockForHeight(endBlockHeight, block.height)

      // If no event before end block, we're done.
      if (!endBlock) {
        break
      }

      const outputs = await computeRange({
        ...typedFormula,
        chainId: state.chainId,
        targetAddress,
        args,
        blockStart: block,
        blockEnd: endBlock,
      })
      count += outputs.length

      // Store computations in DB.
      if (outputs.length > 0) {
        await Computation.createFromComputationOutputs(
          targetAddress,
          typedFormula,
          args,
          outputs
        )
      }

      console.log(
        `  - Batch ${i} (${block.height}-${
          endBlock.height
        }): ${outputs.length.toLocaleString()}`
      )

      block = endBlock
      i++
    }

    computations += count

    const end = new Date()
    console.log(
      `Generated ${count.toLocaleString()} computations in ${(
        (end.getTime() - start.getTime()) /
        1000
      ).toLocaleString()}s.`
    )
    console.log()
  }

  const end = new Date()
  console.log(
    `[${end.toLocaleString()}] Generated ${computations.toLocaleString()} computations in ${(
      (end.getTime() - initialStart.getTime()) /
      1000
    ).toLocaleString()}s.`
  )

  await sequelize.close()
  process.exit(0)
}

main()
