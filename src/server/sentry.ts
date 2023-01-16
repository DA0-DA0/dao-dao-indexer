import * as Sentry from '@sentry/node'

export const captureSentryException = (
  ctx: any,
  ...params: Parameters<typeof Sentry['captureException']>
) => {
  Sentry.withScope((scope) => {
    scope.addEventProcessor((event) =>
      Sentry.addRequestDataToEvent(event, ctx.request)
    )
    Sentry.captureException(...params)
  })
}
