import * as _13 from "./wasm/v1/authz";
import * as _14 from "./wasm/v1/genesis";
import * as _15 from "./wasm/v1/ibc";
import * as _16 from "./wasm/v1/proposal";
import * as _17 from "./wasm/v1/query";
import * as _18 from "./wasm/v1/tx";
import * as _19 from "./wasm/v1/types";
import * as _36 from "./wasm/v1/tx.amino";
import * as _37 from "./wasm/v1/tx.registry";
import * as _38 from "./wasm/v1/query.rpc.Query";
import * as _39 from "./wasm/v1/tx.rpc.msg";
import * as _42 from "./rpc.query";
import * as _43 from "./rpc.tx";
export namespace cosmwasm {
  export namespace wasm {
    export const v1 = {
      ..._13,
      ..._14,
      ..._15,
      ..._16,
      ..._17,
      ..._18,
      ..._19,
      ..._36,
      ..._37,
      ..._38,
      ..._39
    };
  }
  export const ClientFactory = {
    ..._42,
    ..._43
  };
}