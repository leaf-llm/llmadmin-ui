import { Context } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { ERROR_CODES, getErrorMessage } from '../i18n';

const getEndpointString = (c: Context) => {
  const jobId = c.req.param('jobId');
  const method = c.req.method;
  const isCancel = method === 'POST' && !!jobId;

  // GET endpoint with jobID - Get finetune
  if (method === 'GET' && !!jobId) {
    return 'retrieveFinetune';
  }
  if (method === 'GET' && !jobId) {
    return 'listFinetunes';
  }
  // POST endpoint without jobID - Create finetune
  if (method === 'POST' && !jobId) {
    return 'createFinetune';
  }
  // POST endpoint with jobID - Cancel finetune
  if (isCancel) {
    return 'cancelFinetune';
  }
  return 'listFinetunes';
};

const BODY_SUPPORTED_ENDPOINTS = ['createFinetune'];

async function finetuneHandler(c: Context) {
  const endpoint = getEndpointString(c);
  try {
    const method = c.req.method;
    const requestHeaders = Object.fromEntries(c.req.raw.headers);
    const request = BODY_SUPPORTED_ENDPOINTS.includes(endpoint)
      ? await c.req.json()
      : {};
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig ?? {},
      request,
      requestHeaders,
      endpoint,
      method,
      'config'
    );

    return tryTargetsResponse;
  } catch (err: any) {
    console.error('finetuneHandler error: ', err);
    return new Response(
      JSON.stringify({
        status: 'failure',
        err_code: ERROR_CODES.ERR_GENERIC,
        message: getErrorMessage('errors.ERR_GENERIC'),
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}

export default finetuneHandler;
