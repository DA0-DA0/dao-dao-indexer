import { KeyInput } from './formulas'

/**
 * Track contracts and save their code IDs to a specified wasm code key in the
 * DB when they are migrated so that other contracts are automatically detected.
 */
export type WasmCodeTracker = {
  /**
   * The chain ID to apply this tracker to.
   */
  chainId: string
  /**
   * The code key to save the code IDs to.
   */
  codeKey: string
  /**
   * The contract addresses to track.
   */
  contractAddresses?: Set<string>
  /**
   * Track contracts with matching state keys and values.
   */
  stateKeys?: (
    | {
        key: KeyInput | KeyInput[]
      } & ({ value: string } | { partialValue: string })
  )[]
}
