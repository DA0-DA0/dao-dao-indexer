import { Command } from 'commander'

import { ConfigManager } from '@/config'
import { loadDb } from '@/db'
import { DbType } from '@/types'

// Set up TimescaleDB extension, replace primary keys with composite keys,
// replace table indexes with better ones, and set up hypertables.

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.parse()
const { config: _config } = program.opts()

// Load config with config option.
ConfigManager.load(_config)

const main = async () => {
  // Load DB on start.
  const sequelize = await loadDb({
    type: DbType.Data,
  })

  const allStartTime = Date.now()
  console.log(`\n[${new Date().toISOString()}] STARTING...\n`)

  await sequelize.query('CREATE EXTENSION IF NOT EXISTS timescaledb;')

  console.log(
    '------------------------------------------------------------------------------------------------'
  )
  for (const query of queries) {
    const startTime = new Date()
    console.log('>', query)
    console.log('[START]', startTime.toISOString())
    try {
      await sequelize.query(query)
    } catch (err) {
      console.error(
        '[ERROR]',
        typeof err === 'object' &&
          err &&
          'original' in err &&
          err.original instanceof Error
          ? err.original.message
          : err
      )
    }
    const endTime = new Date()
    console.log('[END]', endTime.toISOString())
    console.log(
      '[DURATION]',
      (endTime.getTime() - startTime.getTime()).toLocaleString(),
      'ms'
    )
    console.log(
      '------------------------------------------------------------------------------------------------'
    )
  }

  console.log(
    `[${new Date().toISOString()}] FINISHED in ${(
      (Date.now() - allStartTime) /
      1000
    ).toLocaleString()} seconds`
  )

  // Close DB connections.
  await sequelize.close()

  // Exit.
  process.exit(0)
}

main().catch((err) => {
  console.error('Bank migration worker errored', err)
  process.exit(1)
})

const queries = `
CREATE EXTENSION IF NOT EXISTS timescaledb;

ALTER TABLE "BankStateEvents" DROP CONSTRAINT "BankStateEvents_pkey";
ALTER TABLE "BankStateEvents" ADD PRIMARY KEY ("address", "denom", "blockHeight");
ALTER TABLE "BankStateEvents" DROP COLUMN "id";
DROP INDEX bank_state_events_block_height_address_denom;
DROP INDEX bank_state_events_denom;
DROP INDEX bank_state_events_block_height;
DROP INDEX bank_state_events_block_time_unix_ms;
CREATE INDEX bank_state_events_address_denom_block_height ON "BankStateEvents" USING btree ("address", "denom", "blockHeight" DESC);
CREATE INDEX bank_state_events_address_block_height ON "BankStateEvents" USING btree ("address", "blockHeight" DESC);

ALTER TABLE "WasmStateEvents" DROP CONSTRAINT "WasmStateEvents_pkey";
ALTER TABLE "WasmStateEvents" ADD PRIMARY KEY ("contractAddress", "key", "blockHeight");
ALTER TABLE "WasmStateEvents" DROP COLUMN "id";
DROP INDEX wasm_state_events_block_height_contract_address_key;
DROP INDEX wasm_state_events_contract_address_block_height;
DROP INDEX wasm_state_events_key;
DROP INDEX wasm_state_events_block_height;
DROP INDEX wasm_state_events_block_time_unix_ms;
CREATE INDEX wasm_state_events_key_block_height ON "WasmStateEvents" USING btree ("key" text_pattern_ops, "blockHeight" DESC);
CREATE INDEX wasm_state_events_contract_address_key_block_height ON "WasmStateEvents" USING btree ("contractAddress", "key" text_pattern_ops, "blockHeight" DESC);
CREATE INDEX wasm_state_events_key_trgm_idx ON "WasmStateEvents" USING gin ("key" gin_trgm_ops);

ALTER TABLE "WasmStateEventTransformations" DROP CONSTRAINT "WasmStateEventTransformations_pkey";
ALTER TABLE "WasmStateEventTransformations" ADD PRIMARY KEY ("contractAddress", "name", "blockHeight");
ALTER TABLE "WasmStateEventTransformations" DROP COLUMN "id";
DROP INDEX wasm_state_event_transformations_contract_address_name_block_height;
DROP INDEX wasm_state_event_transformations_contract_address_name_block_he;
DROP INDEX wasm_state_event_transformations_;
DROP INDEX wasm_state_event_transformations_block_height;
CREATE INDEX wasm_state_event_transformations_name_block_height ON "WasmStateEventTransformations" USING btree ("name" text_pattern_ops, "blockHeight" DESC);
CREATE INDEX wasm_state_event_transformations_contract_address_name_block_height ON "WasmStateEventTransformations" USING btree ("contractAddress", "name" text_pattern_ops, "blockHeight" DESC);
CREATE INDEX wasm_state_event_transformations_name_trgm_idx ON "WasmStateEventTransformations" USING gin ("name" gin_trgm_ops);

ALTER TABLE "GovProposals" DROP CONSTRAINT "GovProposals_pkey";
ALTER TABLE "GovProposals" ADD PRIMARY KEY ("proposalId", "blockHeight");
ALTER TABLE "GovProposals" DROP COLUMN "id";
DROP INDEX gov_proposals_block_height_proposal_id;
DROP INDEX gov_proposals_block_height;
DROP INDEX gov_proposals_block_time_unix_ms;
DROP INDEX gov_proposals_proposal_id;
DROP INDEX gov_proposals_proposal_id_block_height;
CREATE INDEX gov_proposals_proposal_id_block_height ON "GovProposals" USING btree ("proposalId", "blockHeight" DESC);

ALTER TABLE "GovProposalVotes" DROP CONSTRAINT "GovProposalVotes_pkey";
ALTER TABLE "GovProposalVotes" ADD PRIMARY KEY ("voterAddress", "proposalId", "blockHeight");
ALTER TABLE "GovProposalVotes" DROP COLUMN "id";
DROP INDEX gov_proposal_votes_block_height_proposal_id_voter_address;
DROP INDEX gov_proposal_votes_block_height;
DROP INDEX gov_proposal_votes_block_time_unix_ms;
DROP INDEX gov_proposal_votes_proposal_id;
DROP INDEX gov_proposal_votes_voter_address;
CREATE INDEX gov_proposal_votes_proposal_id_block_height ON "GovProposalVotes" USING btree ("proposalId", "blockHeight");

VACUUM ANALYZE;
`
  .trim()
  .split('\n')
  .filter(Boolean)
