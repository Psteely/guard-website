export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

// --- CORS wrapper ---
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  // OPTIONS preflight
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  try {
    // -------------------------
    // NEW: /api/usage endpoint
    // -------------------------
    if (path === "/api/usage") {
      return withCors(
        new Response(JSON.stringify({ ok: true, usage: "not implemented" }), {
          status: 200
        })
      );
    }

    // -------------------------
    // NEW: /api/list endpoint
    // -------------------------
    if (path === "/api/list") {
      const keys = await env.PB_KV.list({ prefix: "pb:" });
      const list = keys.keys.map(k => k.name.replace("pb:", ""));
      return withCors(new Response(JSON.stringify(list), { status: 200 }));
    }

    // -------------------------
    // GET /api/pb/:id/full
    // -------------------------
    if (path.startsWith("/api/pb/") && path.endsWith("/full")) {
      const id = path.split("/")[3];
      if (!id) return withCors(new Response("Missing PB ID", { status: 400 }));

      const objId = env.PB.idFromName(id);
      const stub = env.PB.get(objId);
      const result = await stub.fetch("https://dummy/full").then(r => r.json());

      return withCors(new Response(JSON.stringify(result), { status: 200 }));
    }

    // -------------------------
    // GET /api/pb/:id
    // -------------------------
    if (path.startsWith("/api/pb/") && request.method === "GET") {
      const id = path.split("/")[3];
      if (!id) return withCors(new Response("Missing PB ID", { status: 400 }));

      const objId = env.PB.idFromName(id);
      const stub = env.PB.get(objId);
      const result = await stub.fetch("https://dummy").then(r => r.json());

      return withCors(new Response(JSON.stringify(result), { status: 200 }));
    }

    // -------------------------
    // POST /api/pb/create
    // -------------------------
    if (path === "/api/pb/create" && request.method === "POST") {
      const body = await request.json();
      const id = crypto.randomUUID();

      const objId = env.PB.idFromName(id);
      const stub = env.PB.get(objId);

      await stub.fetch("https://dummy/create", {
        method: "POST",
        body: JSON.stringify(body)
      });

      // NEW: store PB ID in KV for list endpoint
      await env.PB_KV.put(`pb:${id}`, "1");

      return withCors(new Response(JSON.stringify({ ok: true, id }), { status: 200 }));
    }

    // -------------------------
    // DELETE /api/pb/:id
    // -------------------------
    if (path.startsWith("/api/pb/") && request.method === "DELETE") {
      const id = path.split("/")[3];
      if (!id) return withCors(new Response("Missing PB ID", { status: 400 }));

      const objId = env.PB.idFromName(id);
      const stub = env.PB.get(objId);

      await stub.fetch("https://dummy/delete", { method: "DELETE" });

      // Remove from KV registry
      await env.PB_KV.delete(`pb:${id}`);

      return withCors(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }

    return withCors(new Response("Not found", { status: 404 }));

  } catch (err) {
    return withCors(new Response("Server error: " + err.message, { status: 500 }));
  }
}

// -------------------------
// Durable Object: PB
// -------------------------
export class PB {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.endsWith("/create") && request.method === "POST") {
        const body = await request.json();
        await this.state.storage.put("pb", body);
        return withCors(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }

      if (path.endsWith("/delete") && request.method === "DELETE") {
        await this.state.storage.delete("pb");
        return withCors(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }

      if (path.endsWith("/full")) {
        const pb = await this.state.storage.get("pb");
        if (!pb) return withCors(new Response("PB not found", { status: 404 }));
        return withCors(new Response(JSON.stringify(pb), { status: 200 }));
      }

      const pb = await this.state.storage.get("pb");
      if (!pb) return withCors(new Response("PB not found", { status: 404 }));

      return withCors(new Response(JSON.stringify(pb), { status: 200 }));

    } catch (err) {
      return withCors(new Response("DO error: " + err.message, { status: 500 }));
    }
  }
}
