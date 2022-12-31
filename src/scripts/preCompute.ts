import { Command } from 'commander'

import { Block, computeRange, loadConfig, validateBlockString } from '@/core'
import { getTypedFormula } from '@/data'
import { Computation, Contract, Event, State, loadDb } from '@/db'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.requiredOption('-f, --formula <formula>', 'formula name to compute')
  program.requiredOption('-t, --target <address>', 'target contract address')
  program.option('-a, --args <args>', 'JSON args to pass to formula', '{}')
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
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

  await loadDb()

  if (!(await Contract.findByPk(options.target))) {
    throw new Error(`Contract not found: ${options.target}`)
  }

  const blockStart: Block | undefined = options.start
    ? validateBlockString(options.start, 'start')
    : (
        await Event.findOne({
          where: {
            contractAddress: options.target,
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

  const start = new Date()
  console.log(
    `[${new Date().toISOString()}] Precomputing ${
      options.formula
    } (with args ${JSON.stringify(args)}) for ${options.target} from ${
      blockStart.height
    } to ${blockEnd.height}...`
  )

  const outputs = await computeRange({
    ...typedFormula,
    targetAddress: options.target,
    args,
    blockStart,
    blockEnd,
  })

  // Store computations in DB.
  if (outputs.length > 0) {
    await Computation.createFromComputationOutputs(
      options.target,
      options.formula,
      args,
      ...outputs
    )
  }

  const end = new Date()

  console.log(
    `[${new Date().toISOString()}] Precomputed ${outputs.length.toLocaleString()} computations in ${(
      (end.getTime() - start.getTime()) /
      1000
    ).toLocaleString()}s.`
  )

  process.exit(0)
}

main()
