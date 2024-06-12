import { QueryInterface } from 'sequelize'

import { WasmCodeService } from '@/services/wasm-codes'

module.exports = {
  async up(queryInterface: QueryInterface) {
    // loads from config automatically
    const codes = (await WasmCodeService.setUpInstance()).getWasmCodes()

    await queryInterface.bulkInsert(
      'WasmCodeKeys',
      codes.map(({ codeKey }) => ({ codeKey }))
    )
    await queryInterface.bulkInsert(
      'WasmCodeKeyIds',
      codes.flatMap(({ codeKey, codeIds }) =>
        codeIds.map((codeKeyId) => ({
          codeKey,
          codeKeyId,
        }))
      )
    )
  },
  async down(queryInterface: QueryInterface) {
    await queryInterface.bulkDelete('WasmCodeKeyIds', {})
    await queryInterface.bulkDelete('WasmCodeKeys', {})
  },
}
