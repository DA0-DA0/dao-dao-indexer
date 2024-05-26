import { WasmCode } from './types'
import { WasmCodeService } from './wasm-code.service'

test('WasmCodeService', () => {
  const codeIds = {
    codeKey1: [1, 2, 3],
    codeKey2: [4, 5, 6],
  }
  const wasmCodeService = new WasmCodeService(codeIds)

  expect(wasmCodeService.getWasmCodes()).toEqual([
    new WasmCode('codeKey1', [1, 2, 3]),
    new WasmCode('codeKey2', [4, 5, 6]),
  ])

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
})
