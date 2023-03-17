import { Command } from 'commander'
import { Op } from 'sequelize'

import {
  Block,
  FormulaType,
  bigIntMin,
  computeRange,
  loadConfig,
  validateBlockString,
} from '@/core'
import { getTypedFormula } from '@/data'
import { Computation, Contract, State, WasmStateEvent, loadDb } from '@/db'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.requiredOption('-f, --formula <formula>', 'formula name to compute')
  program.option('-a, --args <args>', 'JSON args to pass to formula', '{}')
  program.option(
    '-t, --targets <addresses>',
    'comma-separated list of target contract addresses',
    (value) => value.split(',')
  )
  program.option(
    '-i, --ids <code IDs>',
    'comma-separated list of code IDs',
    (value) => value.split(',').map((id) => parseInt(id, 10))
  )
  program.option(
    '-s, --start <blockHeight:timeUnixMs>',
    'block to start computing from (defaults to earliest event for the target contract)'
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

  let contractAddresses: string[]

  if (options.targets) {
    contractAddresses = (
      await Contract.findAll({
        where: {
          address: options.targets,
        },
      })
    ).map((contract) => contract.address)
  } else if (options.ids?.length) {
    contractAddresses = (
      await Contract.findAll({
        where: {
          codeId: options.ids,
        },
      })
    ).map((contract) => contract.address)
  } else {
    throw new Error(
      'Must specify either target contract addresses or code IDs.'
    )
  }

  if (contractAddresses.length === 0) {
    throw new Error('No contracts found.')
  }

  const blockStart: Block | undefined = options.start
    ? validateBlockString(options.start, 'start')
    : (
        await WasmStateEvent.findOne({
          where: {
            contractAddress: contractAddresses,
          },
          order: [['blockHeight', 'ASC']],
        })
      )?.block

  // If blockStart undefined, no events found.
  if (!blockStart) {
    throw new Error('No events found.')
  }

  const blockEnd: Block | undefined = options.end
    ? validateBlockString(options.end, 'end')
    : (await State.getSingleton())?.latestBlock

  // If blockEnd undefined, no state found.
  if (!blockEnd) {
    throw new Error('No state found.')
  }

  const typedFormula = getTypedFormula(FormulaType.Contract, options.formula)

  const initialStart = new Date()
  console.log(
    `[${initialStart.toLocaleString()}] Computing ${
      options.formula
    } (with args ${JSON.stringify(
      args
    )}) for ${contractAddresses.length.toLocaleString()} contract${
      contractAddresses.length === 1 ? '' : 's'
    } from ${blockStart.height} to ${blockEnd.height}:`
  )
  contractAddresses.forEach((address) => console.log(`  - ${address}`))
  console.log()

  let computations = 0
  for (const targetAddress of contractAddresses) {
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
      const endBlockEvent = await WasmStateEvent.findOne({
        where: {
          contractAddress: targetAddress,
          blockHeight: {
            // Make sure we don't infinite loop on one block.
            [Op.gt]: block.height,
            [Op.lte]: endBlockHeight,
          },
        },
        order: [['blockHeight', 'DESC']],
      })

      // If no event before end block, we're done.
      if (!endBlockEvent) {
        break
      }

      const outputs = await computeRange({
        ...typedFormula,
        targetAddress,
        args,
        blockStart: block,
        blockEnd: endBlockEvent.block,
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
          endBlockEvent.blockHeight
        }): ${outputs.length.toLocaleString()}`
      )

      block = endBlockEvent.block
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
