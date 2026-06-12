import { RouterError } from '../errors/RouterError';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { ERROR_CODES, getErrorMessage } from '../i18n';
import { Context } from 'hono';

/**
 * Handles the '/messages' API request by selecting the appropriate provider(s) and making the request to them.
 *
 * @param {Context} c - The Cloudflare Worker context.
 * @returns {Promise<Response>} - The response from the provider.
 * @throws Will throw an error if no provider options can be determined or if the request to the provider(s) fails.
 * @throws Will throw an 500 error if the handler fails due to some reasons
 */
export async function messagesHandler(c: Context): Promise<Response> {
  try {
    let request = await c.req.json();
    let requestHeaders = Object.fromEntries(c.req.raw.headers);

    // The Anthropic Messages API requires a non-empty `messages` array
    // (each turn has at least one user message). Reject malformed requests
    // here with a clear 400 instead of forwarding them to the upstream
    // provider and letting it complain with an opaque "contents is not
    // specified" / "messages: []" error. Anthropic SDK clients always
    // send `messages`, so this check mostly catches hand-rolled or
    // half-constructed requests.
    if (
      !request ||
      !Array.isArray(request.messages) ||
      request.messages.length === 0
    ) {
      throw new RouterError(
        '`messages` is required and must be a non-empty array of conversation turns.'
      );
    }

    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig ?? {},
      request,
      requestHeaders,
      'messages',
      'POST',
      'config'
    );

    return tryTargetsResponse;
  } catch (err: any) {
    console.log('messages error', err.message);
    let statusCode = 500;
    let errCode = ERROR_CODES.ERR_GENERIC;
    let errorMessage = getErrorMessage('errors.something_went_wrong');

    if (err instanceof RouterError) {
      statusCode = 400;
      errorMessage = err.message;
      errCode = ERROR_CODES.ERR_GENERIC;
    }

    return new Response(
      JSON.stringify({
        status: 'failure',
        err_code: errCode,
        message: errorMessage,
      }),
      {
        status: statusCode,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}
