# wasmd-indexer

A state-based indexer and API builder for the Cosmos SDK, primarily focusing on
x/wasm.

## Setup

1. Create `config.json` from example `config.json.example`.

2. Install dependencies.

   ```bash
   npm install
   ```

3. Build the indexer.

   ```bash
   npm run build
   ```

4. Setup the database.

   ```bash
   # try migrating to generate the migrations table
   # this should FAIL, but that is ok
   npm run db:migrate:data

   npm run db:setup
   ```

5. Run the exporter or server.

   ```bash
   npm run export:prod
   # OR
   npm run serve:prod
   ```

6. Tell pm2 to run on startup.

   ```bash
   pm2 startup
   ```

## Usage

Test the indexer:

```bash
npm run test
```

Build the indexer:

```bash
npm run build
```

Run the exporter:

```bash
npm run export
```

Run the API server:

```bash
npm run serve
```

Spawn a console to interact with the various database models and API formulas:

```bash
npm run console
```

## Documentation

To understand how this indexer works and why it exists, read through the
[documentation](./docs/start.md).

## Database utilities

### Add read-only user in PostgreSQL

```sql
REVOKE ALL ON DATABASE db FROM readonly_user;
-- revoke access from all databases
SELECT format('REVOKE ALL ON DATABASE %I FROM readonly_user;', datname) FROM pg_database \gexec
-- grant connection access to all databases
SELECT format('GRANT CONNECT, SELECT ON DATABASE %I TO readonly_user;', datname) FROM pg_database WHERE datname = 'accounts' OR datname LIKE '%_%net' \gexec
-- grant access to use SELECT on all tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
-- grant access to list tables
GRANT USAGE ON SCHEMA public TO readonly_user;
-- grant read access to future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
```

### Find the code IDs for a given Event key

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "Events" INNER JOIN "Contracts" ON "Contracts"."address" = "Events"."contractAddress" WHERE "key" = '' ORDER BY "codeId" ASC;
```

Find by contract name (key is `contract_info`)

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "Events" INNER JOIN "Contracts" ON "Contracts"."address" = "Events"."contractAddress" WHERE "key" = '99,111,110,116,114,97,99,116,95,105,110,102,111' AND value LIKE '%CONTRACT_NAME%' ORDER BY "codeId" ASC;
```

## Attribution

Credit to ekez for the initial idea and design of the state-based x/wasm
indexer, and noah for the subsequent architecting, implementation, and
optimization. Built for [DAO DAO](https://daodao.zone) and the CosmWasm
ecosystem as a whole.
