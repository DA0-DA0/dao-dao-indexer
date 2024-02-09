import * as _17 from "./wasm/v1/authz";
import * as _18 from "./wasm/v1/genesis";
import * as _19 from "./wasm/v1/ibc";
import * as _20 from "./wasm/v1/proposal";
import * as _21 from "./wasm/v1/query";
import * as _22 from "./wasm/v1/tx";
import * as _23 from "./wasm/v1/types";
import * as _44 from "./wasm/v1/tx.amino";
import * as _45 from "./wasm/v1/tx.registry";
import * as _46 from "./wasm/v1/query.rpc.Query";
import * as _47 from "./wasm/v1/tx.rpc.msg";
import * as _50 from "./rpc.query";
import * as _51 from "./rpc.tx";
export namespace cosmwasm {
  export namespace wasm {
    export const v1 = {
      ..._17,
      ..._18,
      ..._19,
      ..._20,
      ..._21,
      ..._22,
      ..._23,
      ..._44,
      ..._45,
      ..._46,
      ..._47
    };
  }
  export const ClientFactory = {
    ..._50,
    ..._51
  };
}