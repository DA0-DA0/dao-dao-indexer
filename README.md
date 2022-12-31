# wasmd-indexer

## DB Setup

Create `config.json` from example `config.json.example`.

Run

```bash
npm run db:setup
```

### Add read-only user in PostgreSQL

```sql
REVOKE ALL ON DATABASE db FROM readonly_user;
GRANT CONNECT ON DATABASE db TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
```

### Find the code IDs for a given Event key

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "Events" INNER JOIN "Contracts" ON "Contracts"."address" = "Events"."contractAddress" WHERE "key" = '' ORDER BY "codeId" ASC;
```
