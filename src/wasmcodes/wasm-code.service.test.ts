import { WasmCodeKey } from '@/db/models/WasmCodeKey'

import { WasmCode } from './types'
import { WasmCodeService } from './wasm-code.service'

test('WasmCodeService', async () => {
  const codeIds = {
    codeKey1: [1, 2, 3],
    codeKey2: [4, 5, 6],
  }
  const wasmCodeService = new WasmCodeService(codeIds)

  expect(wasmCodeService.getWasmCodes()).toEqual([
    new WasmCode('codeKey1', [1, 2, 3]),
    new WasmCode('codeKey2', [4, 5, 6]),
  ])

  expect(wasmCodeService.exportWasmCodes()).toEqual(codeIds)

  expect(wasmCodeService.getWasmCodeAllIds()).toEqual([1, 2, 3, 4, 5, 6])

  expect(wasmCodeService.findWasmCodeIdsByKeys('codeKey1')).toEqual([1, 2, 3])
  expect(wasmCodeService.findWasmCodeIdsByKeys('codeKey2')).toEqual([4, 5, 6])
  expect(wasmCodeService.findWasmCodeIdsByKeys('codeKey1', 'codeKey2')).toEqual(
    [1, 2, 3, 4, 5, 6]
  )

  expect(wasmCodeService.findWasmCodeKeyById(1)).toEqual('codeKey1')
  expect(wasmCodeService.findWasmCodeKeyById(4)).toEqual('codeKey2')
  expect(wasmCodeService.findWasmCodeKeyById(7)).toBeUndefined()

  expect(wasmCodeService.someWasmKeysHasCodeId(1, 'codeKey1')).toBeTruthy()
  expect(wasmCodeService.someWasmKeysHasCodeId(4, 'codeKey2')).toBeTruthy()
  expect(wasmCodeService.someWasmKeysHasCodeId(7, 'codeKey1')).toBeFalsy()

  expect(wasmCodeService.extractWasmCodeKeys(undefined)).toEqual([])
  expect(wasmCodeService.extractWasmCodeKeys('')).toEqual([])
  expect(wasmCodeService.extractWasmCodeKeys('codeKey1')).toEqual(['codeKey1'])
  expect(wasmCodeService.extractWasmCodeKeys('codeKey1,codeKey2')).toEqual([
    'codeKey1',
    'codeKey2',
  ])

  await WasmCodeKey.createWasmCode('codeKey1', 1)
  await WasmCodeKey.createWasmCode('codeKey2', [2, 3])
  await WasmCodeKey.createWasmCode('codeKey3', [])

  const wasmCodes = await wasmCodeService.loadWasmCodeIdsFromDB()

  expect(wasmCodes).toEqual([
    new WasmCode('codeKey1', [1]),
    new WasmCode('codeKey2', [2, 3]),
    new WasmCode('codeKey3', []),
  ])

  const newWasmCodeService = await WasmCodeService.newWithWasmCodesFromDB()
  expect(newWasmCodeService.getWasmCodes()).toEqual(wasmCodes)

  await wasmCodeService.reloadWasmCodes()
  expect(wasmCodeService.getWasmCodes()).toEqual(wasmCodes)

  await WasmCodeKey.createWasmCode('codeKey4', [])
  await wasmCodeService.reloadWasmCodes()
  expect(wasmCodeService.getWasmCodes()).toEqual([
    ...wasmCodes,
    new WasmCode('codeKey4', []),
  ])
})
