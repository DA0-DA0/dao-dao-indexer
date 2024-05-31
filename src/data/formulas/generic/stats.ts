import { GenericFormula, dbKeyForKeys } from '@/core'

export const daos: GenericFormula<number> = {
  dynamic: true,
  compute: async ({ query }) => {
    // sg_dao and cw3_dao are beta/legacy DAO DAO (v0.2.5 and v0.3.0)
    const [{ count }] = await query(
      `SELECT COUNT(*) as "count" FROM (SELECT DISTINCT ON ("contractAddress") "contractAddress" FROM "WasmStateEvents" WHERE "key" = '${dbKeyForKeys(
        'contract_info'
      )}' AND ("value" LIKE '%cw-core%' OR "value" LIKE '%cwd-core%' OR "value" LIKE '%dao-core%' OR "value" LIKE '%sg_dao%' OR "value" LIKE '%cw3_dao%') ORDER BY "contractAddress") tmp`
    )

    return Number(count)
  },
}

export const proposals: GenericFormula<number> = {
  dynamic: true,
  compute: async ({ query }) => {
    const [{ count }] = await query(
      `SELECT COUNT(*) as "count" FROM (SELECT DISTINCT ON ("contractAddress", "name") "name" FROM "WasmStateEventTransformations" WHERE "name" LIKE 'proposal:%' ORDER BY "contractAddress", "name") tmp`
    )

    return Number(count)
  },
}

export const votes: GenericFormula<number> = {
  dynamic: true,
  compute: async ({ query }) => {
    const [{ count }] = await query(
      `SELECT COUNT(*) AS "count" FROM "WasmStateEventTransformations" WHERE ("WasmStateEventTransformations"."name" LIKE 'voteCast:%')`
    )

    return Number(count)
  },
}

export const uniqueVoters: GenericFormula<number> = {
  dynamic: true,
  compute: async ({ query }) => {
    const [{ count }] = await query(
      `SELECT COUNT(*) as "count" FROM (SELECT DISTINCT ON (value->'voter') value->'voter' FROM "WasmStateEventTransformations" WHERE "name" LIKE 'voteCast:%' ORDER BY value->'voter') tmp`
    )

    return Number(count)
  },
}
