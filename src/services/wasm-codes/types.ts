export class WasmCode {
  constructor(
    private readonly _codeKey: string,
    private readonly _codeIds: number[]
  ) {}

  get codeKey(): string {
    return this._codeKey
  }

  get codeIds(): number[] {
    return this._codeIds
  }
}
