import {
  stripCompressionForStreamingResponse,
} from './streamingCompression';

describe('stripCompressionForStreamingResponse', () => {
  test('strips content-encoding from a text/event-stream response', () => {
    const res = new Response('event: message_start\ndata: {}\n\n', {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'content-encoding': 'br',
      },
    });

    stripCompressionForStreamingResponse(res);

    expect(res.headers.get('content-encoding')).toBeNull();
    // Other headers must be preserved.
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
  });

  test('preserves content-encoding on non-streaming JSON responses', () => {
    const res = new Response('{"hello":"world"}', {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-encoding': 'gzip',
      },
    });

    stripCompressionForStreamingResponse(res);

    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  test('preserves content-encoding on text/event-stream when there is none', () => {
    const res = new Response('event: ping\n\n', {
      headers: {
        'content-type': 'text/event-stream',
      },
    });

    stripCompressionForStreamingResponse(res);

    expect(res.headers.get('content-encoding')).toBeNull();
  });

  test('matches event-stream content type case-insensitively', () => {
    const res = new Response('event: ping\n\n', {
      headers: {
        'content-type': 'TEXT/EVENT-STREAM; charset=utf-8',
        'content-encoding': 'br',
      },
    });

    stripCompressionForStreamingResponse(res);

    expect(res.headers.get('content-encoding')).toBeNull();
  });

  test('handles undefined response without throwing', () => {
    expect(() => stripCompressionForStreamingResponse(undefined)).not.toThrow();
  });
});
