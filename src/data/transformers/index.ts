import * as Sentry from '@sentry/node'

import {
  Config,
  ProcessedTransformer,
  Transformer,
  TransformerMaker,
} from '@/core'
import { WasmCodeService } from '@/services/wasm-codes'

import common from './common'
import dao from './dao'
import external from './external'
import polytone from './polytone'
import prePropose from './prePropose'
import proposal from './proposal'
import staking from './staking'
import valence from './valence'
import voting from './voting'

let processedTransformers: ProcessedTransformer[] | undefined
export const getProcessedTransformers = (
  config: Config
): ProcessedTransformer[] => {
  if (!processedTransformers) {
    const transformerMakers: TransformerMaker[] = [
      // Add transformer makers here.
    ]

    const _transformers: Transformer[] = [
      // Add transformers here.
      ...common,
      ...dao,
      ...external,
      ...polytone,
      ...prePropose,
      ...proposal,
      ...staking,
      ...valence,
      ...voting,

      // Makers.
      ...transformerMakers.map((maker) => maker(config)),
    ]

    processedTransformers = _transformers.map(({ filter, ...webhook }) => ({
      ...webhook,
      filter: (event) => {
        let match = true

        const allCodeIds = WasmCodeService.getInstance().findWasmCodeIdsByKeys(
          ...(filter.codeIdsKeys ?? [])
        )

        if (allCodeIds.length) {
          match &&= allCodeIds.includes(event.codeId)
        }

        if (match && filter.contractAddresses?.length) {
          match &&= filter.contractAddresses.includes(event.contractAddress)
        }

        if (match && filter.matches) {
          // Wrap in try/catch in case a transformer errors. Don't want to
          // prevent other events from transforming.
          try {
            match &&= filter.matches(event)
          } catch (error) {
            console.error(
              `Error matching transformer for event ${event.blockHeight}/${event.contractAddress}/${event.key}: ${error}`
            )
            Sentry.captureException(error, {
              tags: {
                type: 'failed-transformer-match',
              },
              extra: {
                event,
              },
            })

            // On error, do not match.
            match = false
          }
        }

        return match
      },
    }))
  }

  return processedTransformers
}
