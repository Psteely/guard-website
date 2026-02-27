var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-M0m8Q0/checked-fetch.js
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
var PBRoom = class {
  static {
    __name(this, "PBRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.loaded = false;
    this.assignments = { main: [], screening: [] };
    this.version = 0;
  }
  async init() {
    if (this.loaded) return;
    const stored = await this.state.storage.get("state");
    if (stored) {
      this.assignments = stored.assignments || { main: [], screening: [] };
      this.version = stored.version || 0;
    }
    this.loaded = true;
  }
  async save() {
    await this.state.storage.put("state", {
      assignments: this.assignments,
      version: this.version
    });
  }
  async handleState() {
    await this.init();
    return new Response(
      JSON.stringify({
        assignments: this.assignments,
        assignVersion: this.version
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  async handleAssign(request) {
    await this.init();
    const { main, screening } = await request.json();
    const set = /* @__PURE__ */ new Set();
    for (const n of main || []) set.add(n);
    for (const n of screening || []) {
      if (set.has(n)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Duplicate captain in both groups"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
    this.assignments = {
      main: main || [],
      screening: screening || []
    };
    this.version += 1;
    await this.save();
    return new Response(
      JSON.stringify({ ok: true, assignVersion: this.version }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  async handleRemoveCaptain(url) {
    await this.init();
    const name = url.searchParams.get("name");
    if (!name) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing name" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    this.assignments.main = (this.assignments.main || []).filter(
      (n) => n !== name
    );
    this.assignments.screening = (this.assignments.screening || []).filter(
      (n) => n !== name
    );
    this.version += 1;
    await this.save();
    return new Response(
      JSON.stringify({ ok: true, assignVersion: this.version }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  async handleBump() {
    await this.init();
    this.version += 1;
    await this.save();
    return new Response(
      JSON.stringify({ ok: true, assignVersion: this.version }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  async handleStream() {
    await this.init();
    const encoder = new TextEncoder();
    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    };
    return new Response(
      new ReadableStream({
        start: /* @__PURE__ */ __name(async (controller) => {
          let lastVersion = this.version;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                assignVersion: lastVersion,
                assignments: this.assignments
              })}

`
            )
          );
          while (true) {
            await new Promise((r) => setTimeout(r, 2e3));
            await this.init();
            if (this.version !== lastVersion) {
              lastVersion = this.version;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    assignVersion: this.version,
                    assignments: this.assignments
                  })}

`
                )
              );
            }
          }
        }, "start")
      }),
      { headers }
    );
  }
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "content-type"
        }
      });
    }
    if (path === "/state" && request.method === "GET") {
      return this.handleState();
    }
    if (path === "/assign" && request.method === "POST") {
      return this.handleAssign(request);
    }
    if (path === "/removeCaptain" && request.method === "POST") {
      return this.handleRemoveCaptain(url);
    }
    if (path === "/bump" && request.method === "POST") {
      return this.handleBump();
    }
    if (path === "/stream" && request.method === "GET") {
      return this.handleStream();
    }
    return new Response("Not found", { status: 404 });
  }
};
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
    if (pathname === "/api/usage") {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const query = `
      {
        viewer {
          accounts(filter: {accountTag: "3325ed80effbf9b08b7e802915c91130"}) {
            workersInvocations(
              limit: 1,
              filter: {
                scriptName: "pb-planner",
                datetime_geq: "${today}T00:00:00Z"
              }
            ) {
              sum { requests }
            }
          }
        }
      }
      `;
      const cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.CF_API_TOKEN}`
        },
        body: JSON.stringify({ query })
      });
      const data = await cfRes.json();
      const requests = data?.data?.viewer?.accounts?.[0]?.workersInvocations?.[0]?.sum?.requests || 0;
      return json({ requests, limit: 1e5 });
    }
    async function loadIndex(env2) {
      const raw = await env2.PB.get("PB_INDEX", { type: "json" });
      return Array.isArray(raw) ? raw : [];
    }
    __name(loadIndex, "loadIndex");
    async function saveIndex(env2, arr) {
      await env2.PB.put("PB_INDEX", JSON.stringify(arr));
    }
    __name(saveIndex, "saveIndex");
    async function addToIndex(env2, id) {
      const idx = await loadIndex(env2);
      if (!idx.includes(id)) {
        idx.push(id);
        await saveIndex(env2, idx);
      }
    }
    __name(addToIndex, "addToIndex");
    async function removeFromIndex(env2, id) {
      const idx = await loadIndex(env2);
      const filtered = idx.filter((x) => x !== id);
      await saveIndex(env2, filtered);
    }
    __name(removeFromIndex, "removeFromIndex");
    async function loadPB(env2, id) {
      return await env2.PB.get(id, { type: "json" });
    }
    __name(loadPB, "loadPB");
    async function savePB(env2, id, pb) {
      await env2.PB.put(id, JSON.stringify(pb));
    }
    __name(savePB, "savePB");
    function getRoomStub(env2, id) {
      const roomId = env2.PB_ROOM.idFromName(id);
      return env2.PB_ROOM.get(roomId);
    }
    __name(getRoomStub, "getRoomStub");
    if (pathname === "/api/officer/version" && request.method === "GET") {
      const data = await env.PB.get("OFFICER_PASSWORD", { type: "json" });
      return json({ version: data?.version || 0 });
    }
    if (pathname === "/api/officer/check" && request.method === "POST") {
      const { password } = await request.json();
      const data = await env.PB.get("OFFICER_PASSWORD", { type: "json" });
      return json({
        ok: data?.password === password,
        version: data?.version || 0
      });
    }
    if (pathname === "/api/officer/password" && request.method === "POST") {
      const { oldPassword, newPassword } = await request.json();
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
      try {
        const ids = await loadIndex(env);
        const list = [];
        for (const id of ids) {
          try {
            const pb = await loadPB(env, id);
            if (!pb) continue;
            list.push({
              id: pb.id,
              name: pb.name || "Unnamed PB",
              date: pb.date || "",
              time: pb.time || "",
              br: pb.br || "",
              water: pb.water || "",
              created: pb.created || 0
            });
          } catch (err) {
            console.error("Bad PB entry:", id, err);
          }
        }
        return json(list);
      } catch (err) {
        console.error("PB LIST ERROR:", err);
        return json({ error: "Failed to load PB list" }, 500);
      }
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
        roster: []
      };
      await savePB(env, id, pb);
      await addToIndex(env, id);
      return json({ ok: true, id });
    }
    if (pathname.startsWith("/api/pb/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = parts[2];
      const pb = await loadPB(env, id);
      if (!pb) return json({ error: "Not found" }, 404);
      const stub = getRoomStub(env, id);
      if (parts.length === 3 && request.method === "DELETE") {
        await env.PB.delete(id);
        await removeFromIndex(env, id);
        return json({ ok: true });
      }
      if (parts[3] === "stream" && request.method === "GET") {
        const doRes = await stub.fetch("https://do/stream", {
          method: "GET",
          headers: { Accept: "text/event-stream" }
        });
        const headers = new Headers(doRes.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(doRes.body, {
          status: doRes.status,
          headers
        });
      }
      if (parts[3] === "config" && request.method === "GET") {
        const doRes = await stub.fetch("https://do/state");
        const doData = await doRes.json();
        return json({
          id: pb.id,
          name: pb.name,
          date: pb.date,
          time: pb.time,
          br: pb.br,
          water: pb.water,
          created: pb.created,
          assignments: doData.assignments || { main: [], screening: [] },
          assignVersion: doData.assignVersion || 0
        });
      }
      if (parts[3] === "roster" && request.method === "GET") {
        return json(pb.roster || []);
      }
      if (parts[3] === "signup" && request.method === "POST") {
        const body = await request.json();
        const pbCurrent = await loadPB(env, id);
        pbCurrent.roster = pbCurrent.roster || [];
        if (pbCurrent.roster.some((p) => p.name === body.name)) {
          return json(
            { ok: false, error: "Name already signed up" },
            400
          );
        }
        pbCurrent.roster.push({
          name: body.name,
          ship: body.ship,
          br: body.br,
          createdBy: body.createdBy
        });
        await savePB(env, id, pbCurrent);
        const stub2 = getRoomStub(env, id);
        await stub2.fetch("https://do/bump", { method: "POST" });
        return json({ ok: true });
      }
      if (parts[3] === "remove" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter((p) => p.name !== name);
        await savePB(env, id, pb);
        await stub.fetch(
          `https://do/removeCaptain?name=${encodeURIComponent(name)}`,
          { method: "POST" }
        );
        return json({ ok: true });
      }
      if (parts[3] === "withdraw" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter((p) => p.name !== name);
        await savePB(env, id, pb);
        await stub.fetch(
          `https://do/removeCaptain?name=${encodeURIComponent(name)}`,
          { method: "POST" }
        );
        return json({ ok: true });
      }
      if (parts[3] === "assign" && request.method === "POST") {
        const body = await request.json();
        const doRes = await stub.fetch("https://do/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            main: body.main || [],
            screening: body.screening || []
          })
        });
        const doData = await doRes.json();
        return json(doData, doRes.ok ? 200 : 400);
      }
      if (parts[3] === "update" && request.method === "POST") {
        const { name, date, time, br, water } = await request.json();
        pb.name = name;
        pb.date = date;
        pb.time = time;
        pb.br = br;
        pb.water = water;
        await savePB(env, id, pb);
        const bumpRes = await stub.fetch("https://do/bump", {
          method: "POST"
        });
        const bumpData = await bumpRes.json();
        return json({ ok: true, assignVersion: bumpData.assignVersion });
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

// .wrangler/tmp/bundle-M0m8Q0/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-M0m8Q0/middleware-loader.entry.ts
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
  PBRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
