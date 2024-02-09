import * as _2 from "./base/query/v1beta1/pagination";
import * as _3 from "./base/v1beta1/coin";
import * as _4 from "./distribution/v1beta1/distribution";
import * as _5 from "./distribution/v1beta1/genesis";
import * as _6 from "./distribution/v1beta1/query";
import * as _7 from "./distribution/v1beta1/tx";
import * as _8 from "./gov/v1/genesis";
import * as _9 from "./gov/v1/gov";
import * as _10 from "./gov/v1/query";
import * as _11 from "./gov/v1/tx";
import * as _12 from "./gov/v1beta1/genesis";
import * as _13 from "./gov/v1beta1/gov";
import * as _14 from "./gov/v1beta1/query";
import * as _15 from "./gov/v1beta1/tx";
import * as _16 from "./msg/v1/msg";
import * as _32 from "./distribution/v1beta1/tx.amino";
import * as _33 from "./gov/v1/tx.amino";
import * as _34 from "./gov/v1beta1/tx.amino";
import * as _35 from "./distribution/v1beta1/tx.registry";
import * as _36 from "./gov/v1/tx.registry";
import * as _37 from "./gov/v1beta1/tx.registry";
import * as _38 from "./distribution/v1beta1/query.rpc.Query";
import * as _39 from "./gov/v1/query.rpc.Query";
import * as _40 from "./gov/v1beta1/query.rpc.Query";
import * as _41 from "./distribution/v1beta1/tx.rpc.msg";
import * as _42 from "./gov/v1/tx.rpc.msg";
import * as _43 from "./gov/v1beta1/tx.rpc.msg";
import * as _48 from "./rpc.query";
import * as _49 from "./rpc.tx";
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
  export namespace distribution {
    export const v1beta1 = {
      ..._4,
      ..._5,
      ..._6,
      ..._7,
      ..._32,
      ..._35,
      ..._38,
      ..._41
    };
  }
  export namespace gov {
    export const v1 = {
      ..._8,
      ..._9,
      ..._10,
      ..._11,
      ..._33,
      ..._36,
      ..._39,
      ..._42
    };
    export const v1beta1 = {
      ..._12,
      ..._13,
      ..._14,
      ..._15,
      ..._34,
      ..._37,
      ..._40,
      ..._43
    };
  }
  export namespace msg {
    export const v1 = {
      ..._16
    };
  }
  export const ClientFactory = {
    ..._48,
    ..._49
  };
}