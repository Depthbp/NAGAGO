var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var UPSTREAM = "https://apis.data.go.kr/B551982/rti";
var ROUTES = {
  crsrd_map_info: 86400,
  // 교차로 목록은 거의 안 바뀌므로 하루
  tl_drct_info: 5
  // 실시간 잔여시간은 5초만 재사용
};
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") {
      return json({ error: "method not allowed" }, 405, cors);
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, hasKey: Boolean(env.DATA_GO_KR_KEY) }, 200, cors);
    }
    const match = url.pathname.match(/^\/api\/signal\/([a-z_]+)$/);
    const fn = match && match[1];
    if (!fn || !Object.hasOwn(ROUTES, fn)) {
      return json({ error: "not found" }, 404, cors);
    }
    if (!env.DATA_GO_KR_KEY) {
      return json({ error: "server key not set" }, 500, cors);
    }
    const query = new URLSearchParams(url.searchParams);
    query.delete("serviceKey");
    const debugMode = query.get("debug");
    const debug = debugMode === "1" || debugMode === "2";
    query.delete("debug");
    if (!query.has("type")) query.set("type", "JSON");
    if (Number(query.get("numOfRows")) > 1e3) query.set("numOfRows", "1000");
    query.sort();
    if (debugMode === "2") {
      const base = `${UPSTREAM}/${fn}?serviceKey=${encodeURIComponent(env.DATA_GO_KR_KEY)}`;
      const noType = new URLSearchParams(query);
      noType.delete("type");
      const variants = {
        proxy: { qs: query.toString(), headers: { "User-Agent": "NAGAGO/1.0", Accept: "application/json" } },
        // 브라우저에서 성공했던 주소와 같은 파라미터 순서 (crsrd_map_info 전용)
        "browser-order": { qs: "pageNo=1&numOfRows=1000&type=JSON&stdgCd=1100000000", headers: {} },
        "no-type": { qs: noType.toString(), headers: {} },
        "plain-headers": { qs: query.toString(), headers: {} }
      };
      const results = await Promise.all(
        Object.entries(variants).map(async ([label, v]) => {
          try {
            const r = await fetch(`${base}&${v.qs}`, { headers: v.headers });
            return [label, { status: r.status, head: (await r.text()).slice(0, 160) }];
          } catch {
            return [label, { error: "fetch failed" }];
          }
        })
      );
      return json(
        {
          colo: request.cf && request.cf.colo,
          country: request.cf && request.cf.country,
          results: Object.fromEntries(results)
        },
        200,
        cors
      );
    }
    const cacheKey = new Request(`https://cache.nagago.local/${fn}?${query}`);
    const cache = caches.default;
    const cached = debug ? null : await cache.match(cacheKey);
    if (cached) {
      return withHeaders(cached, { ...cors, "X-Cache": "HIT" });
    }
    const upstreamUrl = `${UPSTREAM}/${fn}?${new URLSearchParams({ serviceKey: env.DATA_GO_KR_KEY })}&${query}`;
    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: { "User-Agent": "NAGAGO/1.0", Accept: "application/json" }
      });
    } catch {
      return json({ error: "upstream unreachable" }, 502, cors);
    }
    const body = await upstream.text();
    if (debug) {
      return json(
        {
          upstreamStatus: upstream.status,
          upstreamUrl: `${UPSTREAM}/${fn}?serviceKey=***&${query}`,
          bodyHead: body.slice(0, 300),
          colo: request.cf && request.cf.colo,
          country: request.cf && request.cf.country
        },
        200,
        cors
      );
    }
    const response = new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${ROUTES[fn]}`
      }
    });
    if (upstream.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return withHeaders(response, { ...cors, "X-Cache": "MISS" });
  }
};
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      Vary: "Origin"
    };
  }
  return {};
}
__name(corsHeaders, "corsHeaders");
function withHeaders(response, extra) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}
__name(withHeaders, "withHeaders");
function json(data, status, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
  });
}
__name(json, "json");

// ../../../../../../../../home/wooho/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../../../home/wooho/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-3odbF7/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../../../../../home/wooho/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-3odbF7/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
