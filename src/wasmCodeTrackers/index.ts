import { WasmCodeTracker } from '@/types'

import * as trackers from './trackers'

/**
 * Track contracts and save their code IDs to a specified wasm code key in the
 * DB when they are migrated so that other contracts are automatically detected.
 */
export const wasmCodeTrackers: WasmCodeTracker[] = [
  ...Object.values(trackers).flat(),
]
