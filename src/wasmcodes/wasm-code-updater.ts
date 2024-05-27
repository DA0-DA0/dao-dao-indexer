import { updateConfigCodeIds } from '@/core/config'

// make it singleton
export class WasmCodeUpdater {
  private static instance: WasmCodeUpdater
  private interval: NodeJS.Timeout | undefined
  static getInstance(): WasmCodeUpdater {
    if (!this.instance) {
      this.instance = new WasmCodeUpdater()
    }
    return this.instance
  }
  private constructor() {}

  async updateWasmCodes(keepUpdating: boolean): Promise<void> {
    await updateConfigCodeIds()

    if (keepUpdating) {
      if (!this.interval) {
        this.interval = setInterval(async () => {
          await updateConfigCodeIds()
        }, 2000)
      }
    } else {
      if (this.interval) {
        clearInterval(this.interval)
        this.interval = undefined
      }
    }
  }
}
