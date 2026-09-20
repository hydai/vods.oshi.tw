/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

// Dev servers and the node:test harness talk to the worker over plain HTTP.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Browsers only honor Strict-Transport-Security over TLS; stamping every
// response keeps the code branch-free and is harmless on local HTTP.
function withSecurityHeaders(response: Response, policy?: string): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (policy && headers.get("content-type")?.startsWith("text/html")) {
    headers.set("Content-Security-Policy", policy);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withSecurityHeaders(new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      }));
    }

    if (url.protocol === "http:" && !LOCAL_HOSTNAMES.has(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.href, 301);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return withSecurityHeaders(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        // This deployment has no Images binding. Use vinext's safe original-
        // image response instead of attempting an unavailable transformation.
      }, allowedWidths));
    }

    const nonce = crypto.randomUUID().replaceAll("-", "");
    const development = process.env.NODE_ENV !== "production";
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://www.youtube.com https://s.ytimg.com${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com${development ? " ws: wss:" : ""}`,
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    const requestHeaders = new Headers(request.headers);
    // Replace client-supplied values; vinext propagates the CSP nonce to its
    // bootstrap and streamed RSC scripts. The layout uses it for theme setup.
    requestHeaders.set("Content-Security-Policy", policy);
    requestHeaders.set("x-nonce", nonce);
    const securedRequest = new Request(request, { headers: requestHeaders });
    return withSecurityHeaders(await handler.fetch(securedRequest, env, ctx), policy);
  },
} satisfies ExportedHandler<WorkerEnv>;

export default worker;
