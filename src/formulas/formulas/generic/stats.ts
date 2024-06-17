import { dbKeyForKeys } from '@/utils'

import { GenericFormula } from '../../types'

export const daos: GenericFormula<
  number,
  {
    // Optionally only return results for the last N days.
    daysAgo?: string
  }
> = {
  dynamic: true,
  compute: async ({ query, date, args }) => {
    const daysAgo = args.daysAgo ? Number(args.daysAgo) : undefined
    if (typeof daysAgo === 'number' && (isNaN(daysAgo) || daysAgo <= 0)) {
      throw new Error('daysAgo must be a positive number')
    }

    // sg_dao and cw3_dao are beta/legacy DAO DAO (v0.2.5 and v0.3.0)
    const [{ count }] = await query(
      `SELECT COUNT(*) as "count" FROM (SELECT DISTINCT ON ("contractAddress") "contractAddress" FROM "WasmStateEvents" WHERE "key" = '${dbKeyForKeys(
        'contract_info'
      )}' AND ("value" LIKE '%cw-core%' OR "value" LIKE '%cwd-core%' OR "value" LIKE '%dao-core%' OR "value" LIKE '%sg_dao%' OR "value" LIKE '%cw3_dao%') AND "blockTimeUnixMs" <= $end ${
        daysAgo ? 'AND "blockTimeUnixMs" >= $start' : ''
      } ORDER BY "contractAddress") tmp`,
      {
        end: date.getTime(),
        ...(daysAgo
          ? {
              start: date.getTime() - daysAgo * 24 * 60 * 60 * 1000,
            }
          : {}),
      }
    )

    return Number(count)
  },
}

export const proposals: GenericFormula<
  number,
  {
    // Optionally only return results for the last N days.
    daysAgo?: string
  }
> = {
  dynamic: true,
  compute: async ({ query, date, args }) => {
    const daysAgo = args.daysAgo ? Number(args.daysAgo) : undefined
    if (typeof daysAgo === 'number' && (isNaN(daysAgo) || daysAgo <= 0)) {
      throw new Error('daysAgo must be a positive number')
    }

    const [{ count }] = await query(
      `SELECT COUNT(*) as "count" FROM (SELECT DISTINCT ON ("contractAddress", "name") "name" FROM "WasmStateEventTransformations" WHERE "name" LIKE 'proposal:%' AND "blockTimeUnixMs" <= $end ${
        daysAgo ? 'AND "blockTimeUnixMs" >= $start' : ''
      } ORDER BY "contractAddress", "name") tmp`,
      {
        end: date.getTime(),
        ...(daysAgo
          ? {
              start: date.getTime() - daysAgo * 24 * 60 * 60 * 1000,
            }
          : {}),
      }
    )

    return Number(count)
  },
}

export const votes: GenericFormula<
  number,
  {
    // Optionally only return results for the last N days.
    daysAgo?: string
  }
> = {
  dynamic: true,
  compute: async ({ query, date, args }) => {
    const daysAgo = args.daysAgo ? Number(args.daysAgo) : undefined
    if (typeof daysAgo === 'number' && (isNaN(daysAgo) || daysAgo <= 0)) {
      throw new Error('daysAgo must be a positive number')
    }

    const [{ count }] = await query(
      `SELECT COUNT(*) AS "count" FROM "WasmStateEventTransformations" WHERE "name" LIKE 'voteCast:%' AND "blockTimeUnixMs" <= $end ${
        daysAgo ? 'AND "blockTimeUnixMs" >= $start' : ''
      }`,
      {
        end: date.getTime(),
        ...(daysAgo
          ? {
              start: date.getTime() - daysAgo * 24 * 60 * 60 * 1000,
            }
          : {}),
      }
    )

    return Number(count)
  },
}

export const uniqueVoters: GenericFormula<
  number,
  {
    // Optionally only return results for the last N days.
    daysAgo?: string
  }
> = {
  dynamic: true,
  compute: async ({ query, date, args }) => {
    const daysAgo = args.daysAgo ? Number(args.daysAgo) : undefined
    if (typeof daysAgo === 'number' && (isNaN(daysAgo) || daysAgo <= 0)) {
      throw new Error('daysAgo must be a positive number')
    }

    const [{ count }] = await query(
      `SELECT COUNT(*) as "count" FROM (SELECT DISTINCT ON (value->'voter') value->'voter' FROM "WasmStateEventTransformations" WHERE "name" LIKE 'voteCast:%' AND "blockTimeUnixMs" <= $end ${
        daysAgo ? 'AND "blockTimeUnixMs" >= $start' : ''
      } ORDER BY value->'voter') tmp`,
      {
        end: date.getTime(),
        ...(daysAgo
          ? {
              start: date.getTime() - daysAgo * 24 * 60 * 60 * 1000,
            }
          : {}),
      }
    )

    return Number(count)
  },
}
