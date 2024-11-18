import path from 'path'

import Koa from 'koa'
import serve from 'koa-static'
import { koaSwagger } from 'koa2-swagger-ui'

export const setUpDocs = (app: Koa) => {
  // Serve static folder, which contains the OpenAPI spec rendered by Swagger.
  app.use(
    serve(
      path.join(
        __dirname,
        process.env.NODE_ENV === 'test'
          ? '../../../static'
          : // This gets compiled to `/dist/server/serve.js`, so the
            // relative path must be from there instead of
            // `/dist/server/routes/`. Tests run the TypeScript directly, so
            // they need the real path above.
            '../../static'
      )
    )
  )

  // Swagger UI.
  app.use(
    koaSwagger({
      title: 'DAO DAO API',
      hideTopbar: true,
      routePrefix: '/docs',
      favicon: 'https://daodao.zone/daodao.png',
      swaggerOptions: {
        url: './openapi.json',
        deepLinking: true,
      },
    })
  )
}
