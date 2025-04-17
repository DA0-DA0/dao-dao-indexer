import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { Command } from 'commander'
import { OpenAPIV3_1 } from 'openapi-types'

import {
  accountFormulas,
  contractFormulas,
  genericFormulas,
  validatorFormulas,
} from '@/formulas/formulas'
import { Formula, FormulaType, NestedFormulaMap } from '@/types'

const program = new Command('autodoc')
program.description('Autogenerate OpenAPI spec from the available formulas.')

const OPENAPI_BASE_PATH = path.join(__dirname, '../../static/openapi.json')

const openapi: OpenAPIV3_1.Document = JSON.parse(
  fs.readFileSync(OPENAPI_BASE_PATH, 'utf8')
)

openapi.tags = [
  {
    name: FormulaType.Contract,
    description: 'Endpoints where a smart contract is the subject',
  },
  {
    name: FormulaType.Account,
    description:
      'Endpoints where any account (wallet, contract, etc.) is the subject',
  },
  // {
  //   name: FormulaType.Validator,
  //   description: 'Endpoints where a validator is the subject',
  // },
  {
    name: FormulaType.Generic,
    description: 'Endpoints that do not have a subject',
  },
]

// flatten nested formula object into path to each formula object.
const flatten = (
  obj: NestedFormulaMap<Formula<any, any>>,
  prefix = ''
): Record<string, Formula<any, any>> =>
  Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '/' : ''
    if (
      obj[k] &&
      typeof obj[k] === 'object' &&
      obj[k] !== null &&
      !Array.isArray(obj[k]) &&
      // formula objects have a compute function. if compute exists, do not
      // recurse, so that values are the formula objects.
      !('compute' in obj[k]! && typeof obj[k]!.compute === 'function')
    ) {
      acc = {
        ...acc,
        ...flatten(obj[k] as NestedFormulaMap<Formula<any, any>>, pre + k),
      }
    } else {
      acc[pre + k] = obj[k]
    }
    return acc
  }, {} as Record<string, any>)

const makeFormulaDoc = (
  type: FormulaType,
  path: string,
  formula: Formula<any, any>
): [string, OpenAPIV3_1.PathItemObject] => {
  const hasAddress = type !== FormulaType.Generic
  const addressPathName =
    type === FormulaType.Contract
      ? 'contractAddress'
      : type === FormulaType.Account
      ? 'accountAddress'
      : type === FormulaType.Validator
      ? 'validatorAddress'
      : ''

  // tools must follow the regex: ^[a-zA-Z0-9_-]{1,64}$
  // so slice to 48 characters, hash it, and add an 8-character suffix
  const base = path.replace(/\//g, '_').slice(0, 48)
  const operationId =
    base +
    '_' +
    crypto.createHash('sha256').update(base).digest('hex').slice(0, 7)

  return [
    `/{chainId}/${type}/${hasAddress ? `{${addressPathName}}` : '_'}/${path}`,
    {
      get: {
        tags: [type],
        summary: formula.docs?.description || path.replace(/\//g, ' > '),
        operationId,
        parameters: [
          {
            name: 'chainId',
            in: 'path',
            description: 'chain ID',
            required: true,
            schema: {
              type: 'string' as const,
            },
          },
          ...(hasAddress
            ? [
                {
                  name: addressPathName,
                  in: 'path',
                  description: `${type} address`,
                  required: true,
                  schema: {
                    type: 'string' as const,
                  },
                },
              ]
            : []),
          ...(formula.docs?.args?.map((p) => ({
            ...p,
            in: 'query',
          })) || []),
        ],
        responses: {
          '200': {
            description: 'success',
          },
          ...((formula.docs?.args || []).length > 0 && {
            '400': {
              description: 'missing required arguments',
            },
          }),
        },
      },
    },
  ]
}

openapi.paths = {
  ...Object.fromEntries(
    Object.entries(flatten(contractFormulas)).map(
      ([path, formula]): [string, OpenAPIV3_1.PathItemObject] =>
        makeFormulaDoc(FormulaType.Contract, path, formula)
    )
  ),
  ...Object.fromEntries(
    Object.entries(flatten(accountFormulas)).map(
      ([path, formula]): [string, OpenAPIV3_1.PathItemObject] =>
        makeFormulaDoc(FormulaType.Account, path, formula)
    )
  ),
  ...Object.fromEntries(
    Object.entries(flatten(validatorFormulas)).map(
      ([path, formula]): [string, OpenAPIV3_1.PathItemObject] =>
        makeFormulaDoc(FormulaType.Validator, path, formula)
    )
  ),
  ...Object.fromEntries(
    Object.entries(flatten(genericFormulas)).map(
      ([path, formula]): [string, OpenAPIV3_1.PathItemObject] =>
        makeFormulaDoc(FormulaType.Generic, path, formula)
    )
  ),
}

fs.writeFileSync(OPENAPI_BASE_PATH, JSON.stringify(openapi, null, 2))
