/**
 * Portkey AI Gateway
 *
 * @module index
 */

import { Context, Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import { compress } from 'hono/compress';
import { getRuntimeKey } from 'hono/adapter';
// import { env } from 'hono/adapter' // Have to set this up for multi-environment deployment

// Middlewares
import { requestValidator } from './middlewares/requestValidator';
import { hooks } from './middlewares/hooks';
import { memoryCache } from './middlewares/cache';
import { configInjector } from './middlewares/configInjector';

// Handlers
import { proxyHandler } from './handlers/proxyHandler';
import { chatCompletionsHandler } from './handlers/chatCompletionsHandler';
import { completionsHandler } from './handlers/completionsHandler';
import { embeddingsHandler } from './handlers/embeddingsHandler';
import { logHandler } from './middlewares/log';
import { imageGenerationsHandler } from './handlers/imageGenerationsHandler';
import { createSpeechHandler } from './handlers/createSpeechHandler';
import { createTranscriptionHandler } from './handlers/createTranscriptionHandler';
import { createTranslationHandler } from './handlers/createTranslationHandler';
import { modelsHandler } from './handlers/modelsHandler';
import { realTimeHandler } from './handlers/realtimeHandler';
import filesHandler from './handlers/filesHandler';
import batchesHandler from './handlers/batchesHandler';
import finetuneHandler from './handlers/finetuneHandler';
import { messagesHandler } from './handlers/messagesHandler';
import { imageEditsHandler } from './handlers/imageEditsHandler';
import { messagesCountTokensHandler } from './handlers/messagesCountTokensHandler';
import modelResponsesHandler from './handlers/modelResponsesHandler';
import { adminApp } from './admin/routes';

// utils
import { logger } from './apm';
import { createCacheBackendsRedis } from './shared/services/cache';

// Create a new Hono server instance
const app = new Hono();
const runtime = getRuntimeKey();

if (runtime === 'node' && process.env.REDIS_CONNECTION_STRING) {
  createCacheBackendsRedis(process.env.REDIS_CONNECTION_STRING);
}
/**
 * Middleware that conditionally applies compression middleware based on the runtime.
 * Compression is automatically handled for lagon and workerd runtimes
 * This check if its not any of the 2 and then applies the compress middleware to avoid double compression.
 */
app.use('*', (c, next) => {
  const runtimesThatDontNeedCompression = ['lagon', 'workerd', 'node'];
  if (runtimesThatDontNeedCompression.includes(runtime)) {
    return next();
  }
  return compress()(c, next);
});

if (runtime === 'node') {
  app.use('*', async (c: Context, next) => {
    if (!c.req.url.includes('/realtime')) {
      return next();
    }

    await next();

    if (
      c.req.url.includes('/realtime') &&
      c.req.header('upgrade') === 'websocket' &&
      (c.res.status >= 400 || c.get('websocketError') === true)
    ) {
      const finalStatus = c.get('websocketError') === true ? 500 : c.res.status;
      const socket = c.env.incoming.socket;
      if (socket) {
        socket.write(`HTTP/1.1 ${finalStatus} ${c.res.statusText}\r\n\r\n`);
        socket.destroy();
      }
    }
  });
}

/**
 * GET route for the root path.
 * Returns a greeting message.
 */
app.get('/', (c) => c.text('AI Gateway says hey!'));

// Use prettyJSON middleware for all routes
app.use('*', prettyJSON());

// Use logger middleware for all routes
if (getRuntimeKey() === 'node') {
  app.use(logHandler());
}

// Support the /v1/models endpoint
app.get('/v1/models', modelsHandler);

// Use hooks middleware for all routes
app.use('*', hooks);

app.use('*', memoryCache());

// Local admin UI APIs (providers config + usage stats).
app.route('/admin', adminApp);

// Auto-inject stored user config into requests (before requestValidator, skips admin routes).
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/admin')) return next();
  return configInjector(c, next);
});

/**
 * Default route when no other route matches.
 * Returns a JSON response with a message and status code 404.
 */
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

/**
 * Global error handler.
 * If error is instance of HTTPException, returns the custom response.
 * Otherwise, logs the error and returns a JSON response with status code 500.
 */
app.onError((err, c) => {
  logger.error('Global Error Handler: ', err.message, err.cause, err.stack);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  c.status(500);
  return c.json({ status: 'failure', message: err.message });
});

/**
 * POST route for '/v1/messages' in anthropic format
 */
app.post('/v1/messages', requestValidator, messagesHandler);

app.post(
  '/v1/messages/count_tokens',
  requestValidator,
  messagesCountTokensHandler
);

/**
 * POST route for '/v1/chat/completions'.
 * Handles requests by passing them to the chatCompletionsHandler.
 */
app.post('/v1/chat/completions', requestValidator, chatCompletionsHandler);

/**
 * POST route for '/v1/completions'.
 * Handles requests by passing them to the completionsHandler.
 */
app.post('/v1/completions', requestValidator, completionsHandler);

/**
 * POST route for '/v1/embeddings'.
 * Handles requests by passing them to the embeddingsHandler.
 */
app.post('/v1/embeddings', requestValidator, embeddingsHandler);

/**
 * POST route for '/v1/images/generations'.
 * Handles requests by passing them to the imageGenerations handler.
 */
app.post('/v1/images/generations', requestValidator, imageGenerationsHandler);

/**
 * POST route for '/v1/images/edits'.
 * Handles requests by passing them to the imageGenerations handler.
 */
app.post('/v1/images/edits', requestValidator, imageEditsHandler);

// Temporarily disabled endpoints — remove this middleware to re-enable
const DISABLED_PATH_PREFIXES = ['/v1/audio/', '/v1/video/', '/v1/fine_tuning/'];
const DISABLED_PATHS_EXACT = ['/v1/files', '/v1/batches'];
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (
    DISABLED_PATH_PREFIXES.some((p) => path.startsWith(p)) ||
    DISABLED_PATHS_EXACT.some((p) => path === p || path.startsWith(p + '/'))
  ) {
    return c.json(
      {
        error: {
          message: 'This endpoint is temporarily disabled',
          type: 'invalid_request_error',
        },
      },
      403
    );
  }
  return next();
});

/**
 * POST route for '/v1/audio/speech'.
 * Handles requests by passing them to the createSpeechHandler.
 */
app.post('/v1/audio/speech', requestValidator, createSpeechHandler);

/**
 * POST route for '/v1/audio/transcriptions'.
 * Handles requests by passing them to the createTranscriptionHandler.
 */
app.post(
  '/v1/audio/transcriptions',
  requestValidator,
  createTranscriptionHandler
);

/**
 * POST route for '/v1/audio/translations'.
 * Handles requests by passing them to the createTranslationHandler.
 */
app.post('/v1/audio/translations', requestValidator, createTranslationHandler);

// files
app.get('/v1/files', requestValidator, filesHandler('listFiles', 'GET'));
app.get('/v1/files/:id', requestValidator, filesHandler('retrieveFile', 'GET'));
app.get(
  '/v1/files/:id/content',
  requestValidator,
  filesHandler('retrieveFileContent', 'GET')
);
app.post('/v1/files', requestValidator, filesHandler('uploadFile', 'POST'));
app.delete(
  '/v1/files/:id',
  requestValidator,
  filesHandler('deleteFile', 'DELETE')
);

// batches
app.post(
  '/v1/batches',
  requestValidator,
  batchesHandler('createBatch', 'POST')
);
app.get(
  '/v1/batches/:id',
  requestValidator,
  batchesHandler('retrieveBatch', 'GET')
);
app.get(
  '/v1/batches/*/output',
  requestValidator,
  batchesHandler('getBatchOutput', 'GET')
);
app.post(
  '/v1/batches/:id/cancel',
  requestValidator,
  batchesHandler('cancelBatch', 'POST')
);
app.get('/v1/batches', requestValidator, batchesHandler('listBatches', 'GET'));

// responses
app.post(
  '/v1/responses',
  requestValidator,
  modelResponsesHandler('createModelResponse', 'POST')
);
app.get(
  '/v1/responses/:id',
  requestValidator,
  modelResponsesHandler('getModelResponse', 'GET')
);
app.delete(
  '/v1/responses/:id',
  requestValidator,
  modelResponsesHandler('deleteModelResponse', 'DELETE')
);
app.get(
  '/v1/responses/:id/input_items',
  requestValidator,
  modelResponsesHandler('listResponseInputItems', 'GET')
);

app.all(
  '/v1/fine_tuning/jobs/:jobId?/:cancel?',
  requestValidator,
  finetuneHandler
);

/**
 * POST route for '/v1/prompts/:id/completions'.
 * Handles portkey prompt completions route
 */
app.post('/v1/prompts/*', requestValidator, (c) => {
  if (c.req.url.endsWith('/v1/chat/completions')) {
    return chatCompletionsHandler(c);
  } else if (c.req.url.endsWith('/v1/completions')) {
    return completionsHandler(c);
  }
  c.status(500);
  return c.json({
    status: 'failure',
    message: 'prompt completions error: Something went wrong',
  });
});

// WebSocket route
if (runtime === 'workerd') {
  app.get('/v1/realtime', realTimeHandler);
}

/**
 * @deprecated
 * Support the /v1 proxy endpoint
 */
app.post('/v1/proxy/*', proxyHandler);

// Catch malformed /v1/v1/* paths and return 404
app.all('/v1/v1/*', (c) =>
  c.json({ status: 'failure', message: `Invalid path: ${c.req.path}` }, 404)
);

// Support the /v1 proxy endpoint after all defined endpoints so this does not interfere.
app.post('/v1/*', requestValidator, proxyHandler);

// Support the /v1 proxy endpoint after all defined endpoints so this does not interfere.
app.get('/v1/:path{(?!realtime).*}', requestValidator, proxyHandler);

app.delete('/v1/*', requestValidator, proxyHandler);

// Export the app
export default app;
