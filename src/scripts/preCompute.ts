import { Command } from 'commander'

import { Block, computeRange, loadConfig, validateBlockString } from '@/core'
import { getTypedFormula } from '@/data'
import { Computation, Contract, Event, State, loadDb } from '@/db'

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
    '-s, --start <block height>',
    'block height to start computing from (defaults to earliest event for the target contract)',
    (value) => parseInt(value, 10)
  )
  program.option(
    '-e, --end <block height>',
    'block height to end computing at (defaults to latest block)',
    (value) => parseInt(value, 10)
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
        await Event.findOne({
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

  const typedFormula = getTypedFormula('contract', options.formula)

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

    const outputs = await computeRange({
      ...typedFormula,
      targetAddress,
      args,
      blockStart,
      blockEnd,
    })
    computations += outputs.length

    // Store computations in DB.
    if (outputs.length > 0) {
      await Computation.createFromComputationOutputs(
        targetAddress,
        options.formula,
        args,
        ...outputs
      )
    }

    const end = new Date()
    console.log(
      `Generated ${outputs.length.toLocaleString()} computations in ${(
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
