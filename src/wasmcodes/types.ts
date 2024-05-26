export class WasmCode {
  constructor(
    private readonly _codeKey: string,
    private readonly _codeIds: number[] | undefined
  ) {}

  get codeKey(): string {
    return this._codeKey
  }

  get codeIds(): number[] | undefined {
    return this._codeIds
  }
}
