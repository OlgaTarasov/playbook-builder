import { Router } from 'express';
import { openApiSpec } from '../docs/openapi';

const SWAGGER_VERSION = '5';

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Playbook Builder API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      // Relative on purpose: the page is reached as /docs directly, or as /api/docs
      // through the Vite and nginx proxies, and the spec must follow the same prefix.
      url: 'openapi.json',
      dom_id: '#swagger-ui',
      withCredentials: true,
      persistAuthorization: true,
    });
  </script>
</body>
</html>`;

/** Public: the API description and the interactive page. No session needed. */
export function createDocsRouter(): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  router.get('/docs', (_req, res) => {
    res.type('html').send(page);
  });

  return router;
}
