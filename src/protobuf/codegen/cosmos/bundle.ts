import * as _2 from "./base/query/v1beta1/pagination";
import * as _3 from "./base/v1beta1/coin";
import * as _4 from "./gov/v1/genesis";
import * as _5 from "./gov/v1/gov";
import * as _6 from "./gov/v1/query";
import * as _7 from "./gov/v1/tx";
import * as _8 from "./gov/v1beta1/genesis";
import * as _9 from "./gov/v1beta1/gov";
import * as _10 from "./gov/v1beta1/query";
import * as _11 from "./gov/v1beta1/tx";
import * as _12 from "./msg/v1/msg";
import * as _28 from "./gov/v1/tx.amino";
import * as _29 from "./gov/v1beta1/tx.amino";
import * as _30 from "./gov/v1/tx.registry";
import * as _31 from "./gov/v1beta1/tx.registry";
import * as _32 from "./gov/v1/query.rpc.Query";
import * as _33 from "./gov/v1beta1/query.rpc.Query";
import * as _34 from "./gov/v1/tx.rpc.msg";
import * as _35 from "./gov/v1beta1/tx.rpc.msg";
import * as _40 from "./rpc.query";
import * as _41 from "./rpc.tx";
export namespace cosmos {
  export namespace base {
    export namespace query {
      export const v1beta1 = {
        ..._2
      };
    }
    export const v1beta1 = {
      ..._3
    };
  }
  export namespace gov {
    export const v1 = {
      ..._4,
      ..._5,
      ..._6,
      ..._7,
      ..._28,
      ..._30,
      ..._32,
      ..._34
    };
    export const v1beta1 = {
      ..._8,
      ..._9,
      ..._10,
      ..._11,
      ..._29,
      ..._31,
      ..._33,
      ..._35
    };
  }
  export namespace msg {
    export const v1 = {
      ..._12
    };
  }
  export const ClientFactory = {
    ..._40,
    ..._41
  };
}