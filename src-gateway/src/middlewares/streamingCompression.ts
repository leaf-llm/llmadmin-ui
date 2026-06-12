/**
 * Post-process a response so that streaming SSE bodies are not delivered
 * with a `Content-Encoding` header. Streaming responses are read
 * incrementally by clients (SSE `EventSource`, fetch streaming, etc.)
 * and rely on each chunk being a self-contained text/event-stream
 * record — a `Content-Encoding: br| gzip` header on top of a plain-text
 * SSE body causes the client to fail with a `BrotliDecompressionError`
 * (or `SyntaxError` for gzip). The Hono `compress()` middleware
 * already excludes `text/event-stream` from compression via its
 * content-type regex, but upstream providers (e.g. reverse proxies in
 * front of the model server) can set `Content-Encoding` themselves.
 * Stripping the header after `compress()` runs is the safe fix: the
 * body is a real stream of text, never compressed on the wire for
 * SSE endpoints.
 */
export function stripCompressionForStreamingResponse(
  res: Response | undefined
): void {
  if (!res) return;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.toLowerCase().startsWith('text/event-stream')) {
    if (res.headers.has('content-encoding')) {
      res.headers.delete('content-encoding');
    }
  }
}
