import { WasmCodeKeyId } from '@/db'
import { WasmCodeKey } from '@/db/models/WasmCodeKey'

import { WasmCode } from './types'
import { WasmCodeService } from './wasm-code.service'

describe('WasmCodeService tests', () => {
  let wasmCodeService: WasmCodeService

  afterAll(async () => {
    await wasmCodeService.stopUpdateWasmCodes()
  })

  test('WasmCodeService', async () => {
    const codeIds = {
      codeKey1: [1, 2, 3],
      codeKey2: [4, 5, 6],
      codeKey3: [1, 3, 5],
    }

    await WasmCodeKey.createWasmCode('codeKey1', [1, 2, 3])
    await WasmCodeKey.createWasmCode('codeKey2', [4, 5, 6])
    await WasmCodeKey.createWasmCode('codeKey3', [1, 3, 5])

    wasmCodeService = await WasmCodeService.newWithWasmCodesFromDB()

    expect(wasmCodeService.getWasmCodes()).toEqual([
      new WasmCode('codeKey1', [1, 2, 3]),
      new WasmCode('codeKey2', [4, 5, 6]),
      new WasmCode('codeKey3', [1, 3, 5]),
    ])

    expect(wasmCodeService.exportWasmCodes()).toEqual(codeIds)

    expect(wasmCodeService.findWasmCodeIdsByKeys('codeKey1')).toEqual([1, 2, 3])
    expect(wasmCodeService.findWasmCodeIdsByKeys('codeKey2')).toEqual([4, 5, 6])
    expect(
      wasmCodeService.findWasmCodeIdsByKeys('codeKey1', 'codeKey2')
    ).toEqual([1, 2, 3, 4, 5, 6])

    expect(wasmCodeService.findWasmCodeKeyById(1)).toEqual([
      'codeKey1',
      'codeKey3',
    ])
    expect(wasmCodeService.findWasmCodeKeyById(4)).toEqual(['codeKey2'])
    expect(wasmCodeService.findWasmCodeKeyById(7)).toEqual([])

    expect(wasmCodeService.extractWasmCodeKeys(undefined)).toEqual([])
    expect(wasmCodeService.extractWasmCodeKeys('')).toEqual([])
    expect(wasmCodeService.extractWasmCodeKeys('codeKey1')).toEqual([
      'codeKey1',
    ])
    expect(wasmCodeService.extractWasmCodeKeys('codeKey1,codeKey2')).toEqual([
      'codeKey1',
      'codeKey2',
    ])

    await WasmCodeKeyId.destroy({ where: {} })
    await WasmCodeKey.destroy({ where: {} })

    await WasmCodeKey.createWasmCode('codeKey1', 1)
    await WasmCodeKey.createWasmCode('codeKey2', [2, 3])
    await WasmCodeKey.createWasmCode('codeKey3', [])

    const wasmCodes = await wasmCodeService.loadWasmCodeIdsFromDB()

    expect(wasmCodes).toEqual([
      new WasmCode('codeKey1', [1]),
      new WasmCode('codeKey2', [2, 3]),
      new WasmCode('codeKey3', []),
    ])

    await wasmCodeService.reloadWasmCodes()
    expect(wasmCodeService.getWasmCodes()).toEqual(wasmCodes)

    await WasmCodeKey.createWasmCode('codeKey4', [])
    await wasmCodeService.reloadWasmCodes()
    expect(wasmCodeService.getWasmCodes()).toEqual([
      ...wasmCodes,
      new WasmCode('codeKey4', []),
    ])
  })
})
