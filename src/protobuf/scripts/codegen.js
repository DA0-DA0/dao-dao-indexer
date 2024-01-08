const { join } = require('path')
const telescope = require('@cosmology/telescope').default
// const rimraf = require('rimraf').rimrafSync

const protoDirs = [join(__dirname, '../proto')]
const outPath = join(__dirname, '../codegen')
// rimraf(outPath)

telescope({
  protoDirs,
  outPath,
  options: {
    interfaces: {
      enabled: true,
      useUseInterfacesParams: true,
      useByDefault: false,
      useByDefaultRpc: true,
      useUnionTypes: false,
    },
    tsDisable: {
      patterns: [
        '**/*.registry.ts',
        '**/authz.ts',
        '**/binary.ts',
        '**/tx.ts',
        '**/utf8.ts',
        '**/genesis.ts',
        '**/gov.ts',
        '**/query.ts',
      ],
    },
    removeUnusedImports: true,
    experimentalGlobalProtoNamespace: true,
    prototypes: {
      addTypeUrlToDecoders: true,
      addTypeUrlToObjects: true,
      allowUndefinedTypes: true,
      includePackageVar: false,
      includes: {
        packages: [
          'cosmos.gov.v1',
          'cosmos.gov.v1beta1',
          'cosmwasm.wasm.v1',
          'google.protobuf',
        ],
      },
      // excluded: {
      //   packages: [
      //     // 'ibc.applications.fee.v1',

      //     'cosmos.app.v1alpha1',
      //     'cosmos.app.v1beta1',
      //     'cosmos.autocli.v1',
      //     'cosmos.base.kv.v1beta1',
      //     'cosmos.base.reflection.v1beta1',
      //     'cosmos.base.snapshots.v1beta1',
      //     'cosmos.base.store.v1beta1',
      //     'cosmos.base.tendermint.v1beta1',
      //     'cosmos.capability.v1beta1',
      //     'cosmos.crisis.v1beta1',
      //     'cosmos.evidence.v1beta1',
      //     'cosmos.feegrant.v1beta1',
      //     'cosmos.genutil.v1beta1',
      //     // 'cosmos.gov.v1',
      //     'cosmos.group.v1',
      //     'cosmos.group.v1beta1',
      //     'cosmos.mint.v1beta1',
      //     'cosmos.msg.v1',
      //     'cosmos.nft.v1beta1',
      //     'cosmos.orm.v1',
      //     'cosmos.orm.v1alpha1',
      //     'cosmos.params.v1beta1',
      //     'cosmos.slashing.v1beta1',
      //     'cosmos.vesting.v1beta1',
      //     // 'google.api',
      //     'ibc.core.port.v1',
      //     'ibc.core.types.v1',
      //   ],
      // },
      methods: {
        fromJSON: false,
        toJSON: false,
        encode: true,
        decode: true,
        fromPartial: true,
        toAmino: true,
        fromAmino: false,
        fromProto: true,
        toProto: false,
      },
      parser: {
        keepCase: false,
      },
      typingsFormat: {
        duration: 'duration',
        timestamp: 'date',
        useExact: false,
        useDeepPartial: false,
        num64: 'bigint',
        customTypes: {
          useCosmosSDKDec: true,
        },
      },
    },
    aminoEncoding: {
      enabled: true,
      // exceptions: AMINO_MAP,
      useRecursiveV2encoding: true,
    },
    lcdClients: {
      enabled: false,
    },
    rpcClients: {
      enabled: true,
      camelCase: true,
    },
  },
})
  .then(() => {
    console.log('✨ all done!')
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
