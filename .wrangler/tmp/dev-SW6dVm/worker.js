var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-bx4DJo/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// worker.js
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const json = /* @__PURE__ */ __name((obj, status = 200) => new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json", ...cors }
    }), "json");
    async function loadPBById(id) {
      const { keys } = await env.PB.list();
      for (const k of keys) {
        const pb = await env.PB.get(k.name, { type: "json" });
        if (pb && pb.id === id) {
          return { pb, kvKey: k.name };
        }
      }
      return { pb: null, kvKey: null };
    }
    __name(loadPBById, "loadPBById");
    async function savePB(kvKey, pb) {
      await env.PB.put(kvKey, JSON.stringify(pb));
    }
    __name(savePB, "savePB");
    if (pathname === "/api/officer/version" && request.method === "GET") {
      const data = await env.PB.get("OFFICER_PASSWORD", { type: "json" });
      if (!data) return json({ version: 0 });
      return json({ version: data.version });
    }
    if (pathname === "/api/officer/check" && request.method === "POST") {
      const body = await request.json();
      const { password } = body;
      const data = await env.PB.get("OFFICER_PASSWORD", { type: "json" });
      if (!data || data.password !== password) {
        return json({ ok: false });
      }
      return json({ ok: true, version: data.version });
    }
    if (pathname === "/api/officer/password" && request.method === "POST") {
      const body = await request.json();
      const { oldPassword, newPassword } = body;
      const data = await env.PB.get("OFFICER_PASSWORD", { type: "json" });
      if (!data || data.password !== oldPassword) {
        return json({ ok: false, error: "Forbidden" }, 403);
      }
      const updated = {
        password: newPassword,
        version: (data.version || 1) + 1
      };
      await env.PB.put("OFFICER_PASSWORD", JSON.stringify(updated));
      return json({ ok: true });
    }
    if (pathname === "/api/pb/list" && request.method === "GET") {
      const list = [];
      const { keys } = await env.PB.list();
      for (const k of keys) {
        const pb = await env.PB.get(k.name, { type: "json" });
        if (pb && pb.id) {
          list.push({
            id: pb.id,
            name: pb.name,
            date: pb.date,
            time: pb.time,
            br: pb.br,
            water: pb.water,
            created: pb.created
          });
        }
      }
      return json(list);
    }
    if (pathname === "/api/pb/create" && request.method === "POST") {
      const body = await request.json();
      const id = crypto.randomUUID?.() || crypto.getRandomValues(new Uint8Array(16)).join("");
      const pb = {
        id,
        name: body.name,
        date: body.date,
        time: body.time,
        br: body.br,
        water: body.water,
        created: Date.now(),
        roster: [],
        assignments: null,
        assignVersion: 0
      };
      await env.PB.put(id, JSON.stringify(pb));
      return json({ ok: true, id });
    }
    if (pathname.startsWith("/api/pb/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = parts[2];
      if (parts.length === 3 && request.method === "DELETE") {
        const { pb: pb2, kvKey: kvKey2 } = await loadPBById(id);
        if (!pb2) return json({ ok: false, error: "PB not found" }, 404);
        await env.PB.delete(kvKey2);
        return json({ ok: true });
      }
      const { pb, kvKey } = await loadPBById(id);
      if (!pb) return json({ error: "Not found" }, 404);
      if (parts.length === 4 && parts[3] === "config") {
        return json({
          id: pb.id,
          name: pb.name,
          date: pb.date,
          time: pb.time,
          br: pb.br,
          water: pb.water,
          created: pb.created,
          assignments: pb.assignments || null,
          assignVersion: pb.assignVersion || 0
        });
      }
      if (parts.length === 4 && parts[3] === "roster") {
        return json(pb.roster || []);
      }
      if (parts.length === 4 && parts[3] === "signup" && request.method === "POST") {
        const body = await request.json();
        pb.roster = pb.roster || [];
        if (pb.roster.some((p) => p.name === body.name)) {
          return json({ ok: false, error: "Name already signed up" }, 400);
        }
        pb.roster.push({
          name: body.name,
          ship: body.ship,
          br: body.br
        });
        await savePB(kvKey, pb);
        return json({ ok: true });
      }
      if (parts.length === 5 && parts[3] === "remove" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter((p) => p.name !== name);
        await savePB(kvKey, pb);
        return json({ ok: true });
      }
      if (parts.length === 4 && parts[3] === "assign" && request.method === "POST") {
        const body = await request.json();
        const { main, screening } = body;
        const set = /* @__PURE__ */ new Set();
        for (const n of main) set.add(n);
        for (const n of screening) {
          if (set.has(n)) {
            return json({ ok: false, error: "Duplicate captain in both groups" }, 400);
          }
        }
        pb.assignments = {
          main: main || [],
          screening: screening || []
        };
        pb.assignVersion = (pb.assignVersion || 0) + 1;
        await savePB(kvKey, pb);
        return json({ ok: true, assignVersion: pb.assignVersion });
      }
      if (parts.length === 4 && parts[3] === "update" && request.method === "POST") {
        const body = await request.json();
        const { name, date, time, br, water } = body;
        pb.name = name;
        pb.date = date;
        pb.time = time;
        pb.br = br;
        pb.water = water;
        pb.assignVersion = (pb.assignVersion || 0) + 1;
        await savePB(kvKey, pb);
        return json({ ok: true, assignVersion: pb.assignVersion });
      }
      return json({ error: "Not found" }, 404);
    }
    return new Response("Not found", { status: 404, headers: cors });
  }
};

// ../Users/peter/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
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

// ../Users/peter/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
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
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-bx4DJo/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../Users/peter/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
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

// .wrangler/tmp/bundle-bx4DJo/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
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
//# sourceMappingURL=worker.js.map
