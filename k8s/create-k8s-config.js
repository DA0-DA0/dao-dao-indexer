const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { default: chalk } = require('chalk')
const commander = require('commander')

const program = new commander.Command()

const { output, config, raw, dryRun, verbose, force } = program
  .requiredOption(
    '-o, --output <path>',
    'Path to the output file',
    path.join(__dirname, './configmap-file.yaml')
  )
  .option(
    '-c, --config <path>',
    'Path to the config file',
    path.join(__dirname, './config.json')
  )
  .option(
    '-r, --raw <content>',
    'Raw content to be used as the ConfigMap value instead of the config file'
  )
  .option(
    '-d, --dry-run',
    'Dry run the command, print the output instead of creating the ConfigMap'
  )
  .option('-v, --verbose', 'Verbose output, print the command')
  .option('-f, --force', 'Force the command, overwrite the existing ConfigMap')
  .parse(process.argv)
  .opts()

const configPath = path.resolve(config)
const outputPath = path.resolve(output)

let configContent
if (!raw) {
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red(`Config file not found at ${configPath}`))
    process.exit(1)
  }

  console.log(chalk.cyan(`Using config file at ${configPath}`))

  // Read the config file
  configContent = fs.readFileSync(configPath, 'utf8')
} else {
  console.log(chalk.cyan('Using raw content'))
  configContent = raw
}

const configObject = JSON.parse(configContent)

// Create a YAML-friendly multi-line string
const yamlString =
  '|-\n' +
  JSON.stringify(configObject, null, 2)
    .split('\n')
    .map((line) => '    ' + line)
    .join('\n')

// Get the basic ConfigMap structure
const configMapYaml = execSync(
  'kubectl create configmap argus-config-file --from-literal=dummy=value -o yaml --dry-run=client'
).toString()

if (verbose) {
  console.log(
    chalk.gray(
      `\n> kubectl create configmap argus-config-file --from-literal=dummy=value -o yaml --dry-run=client\n`
    )
  )
}

// Replace the dummy data with our formatted config
const finalYaml = configMapYaml.replace(
  'dummy: value',
  'config.json: ' + yamlString
)

if (!dryRun) {
  if (!force && fs.existsSync(outputPath)) {
    console.log(
      chalk.red(
        `ConfigMap already exists at ${outputPath}. Use --force to overwrite.`
      )
    )
    process.exit(1)
  }

  // Write the result
  fs.writeFileSync(outputPath, finalYaml)
  console.log(chalk.green(`ConfigMap created at ${outputPath}`))
} else {
  console.log(
    chalk.gray(
      `Dry run, would have created ConfigMap at ${outputPath} with the following content:\n\n`
    ) + chalk.magenta(finalYaml)
  )
}
