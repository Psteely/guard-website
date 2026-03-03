export class PB2 {
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

    if (!stored || typeof stored !== "object") {
      this.assignments = { main: [], screening: [] };
      this.version = 0;
      await this.save();
    } else {
      this.assignments = stored.assignments;
      this.version = stored.version;

      if (!this.assignments || typeof this.assignments !== "object") {
        this.assignments = { main: [], screening: [] };
      }
      if (!Array.isArray(this.assignments.main)) {
        this.assignments.main = [];
      }
      if (!Array.isArray(this.assignments.screening)) {
        this.assignments.screening = [];
      }
      if (typeof this.version !== "number") {
        this.version = 0;
      }

      await this.save();
    }

    this.loaded = true;
  }

  async save() {
    await this.state.storage.put("state", {
      assignments: this.assignments,
      version: this.version,
    });
  }

  async handleState() {
    await this.init();
    return new Response(
      JSON.stringify({
        assignments: this.assignments,
        assignVersion: this.version,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  async handleAssign(request) {
    await this.init();
    const { main, screening } = await request.json();

    const set = new Set();
    for (const n of main || []) set.add(n);
    for (const n of screening || []) {
      if (set.has(n)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Duplicate captain in both groups",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    this.assignments = { main: main || [], screening: screening || [] };
    this.version += 1;
    await this.save();

    return new Response(
      JSON.stringify({ ok: true, assignVersion: this.version }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  async handleRemoveCaptain(url) {
    await this.init();
    const name = url.searchParams.get("name");
    if (!name) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing name" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    this.assignments.main = this.assignments.main.filter((n) => n !== name);
    this.assignments.screening = this.assignments.screening.filter(
      (n) => n !== name
    );
    this.version += 1;
    await this.save();

    return new Response(
      JSON.stringify({ ok: true, assignVersion: this.version }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  async handleBump() {
    await this.init();
    this.version += 1;
    await this.save();
    return new Response(
      JSON.stringify({ ok: true, assignVersion: this.version }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  async handleStream() {
    await this.init();
    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream({
        start: async (controller) => {
          let lastVersion = this.version;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                assignVersion: lastVersion,
                assignments: this.assignments,
              })}\n\n`
            )
          );

          while (true) {
            await new Promise((r) => setTimeout(r, 2000));
            await this.init();

            if (this.version !== lastVersion) {
              lastVersion = this.version;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    assignVersion: this.version,
                    assignments: this.assignments,
                  })}\n\n`
                )
              );
            }
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      //* *******
// 🔧 TEMP: hard‑bypass PB full to prove where the 500 is coming from
  if (pathname.startsWith("/api/pb/") && pathname.endsWith("/full")) {
    return new Response(
      JSON.stringify({
        ok: true,
        id: "test",
        name: "Bypass PB",
        assignments: { main: [], screening: [] },
        assignVersion: 0,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }


      //* *******

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        });
      }

      if (path === "/state") return this.handleState();
      if (path === "/assign") return this.handleAssign(request);
      if (path === "/removeCaptain") return this.handleRemoveCaptain(url);
      if (path === "/bump") return this.handleBump();
      if (path === "/stream") return this.handleStream();

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return new Response("DO error: " + err.message, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
      });

    try {
      const url = new URL(request.url);
      const { pathname } = url;

      async function loadIndex() {
        const raw = await env.PB_KV.get("PB_INDEX", { type: "json" });
        return Array.isArray(raw) ? raw : [];
      }

      async function saveIndex(arr) {
        await env.PB_KV.put("PB_INDEX", JSON.stringify(arr));
      }

      async function addToIndex(id) {
        const idx = await loadIndex();
        if (!idx.includes(id)) {
          idx.push(id);
          await saveIndex(idx);
        }
      }

      async function removeFromIndex(id) {
        const idx = await loadIndex();
        await saveIndex(idx.filter((x) => x !== id));
      }

      async function loadPB(id) {
        return await env.PB_KV.get(id, { type: "json" });
      }

      async function savePB(id, pb) {
        await env.PB_KV.put(id, JSON.stringify(pb));
      }

      function getStub(id) {
        return env.PB2.get(env.PB2.idFromName(id));
      }

      if (pathname === "/api/usage") {
        return json({ ok: true, usage: "not implemented" });
      }

      if (pathname === "/api/pb/list") {
        const ids = await loadIndex();
        const list = [];

        for (const id of ids) {
          const pb = await loadPB(id);
          if (pb) {
            list.push({
              id: pb.id,
              name: pb.name,
              date: pb.date,
              time: pb.time,
              br: pb.br,
              water: pb.water,
              created: pb.created,
            });
          }
        }

        return json(list);
      }

      if (pathname === "/api/pb/create" && request.method === "POST") {
        const body = await request.json();
        const id = crypto.randomUUID();

        const pb = {
          id,
          name: body.name,
          date: body.date,
          time: body.time,
          br: body.br,
          water: body.water,
          created: Date.now(),
          roster: [],
        };

        await savePB(id, pb);
        await addToIndex(id);

        return json({ ok: true, id });
      }

      if (pathname.startsWith("/api/pb/")) {
        const parts = pathname.split("/").filter(Boolean);
        const id = parts[2];
        const pb = await loadPB(id);

        if (!pb) return json({ error: "Not found" }, 404);

        const stub = getStub(id);

        if (parts[3] === "full") {
          const doRes = await stub.fetch("https://do/state");
          const doData = await doRes.json();

          return json({
            ok: true,
            ...pb,
            assignments: doData.assignments,
            assignVersion: doData.assignVersion,
          });
        }

        if (parts[3] === "stream") {
          const doRes = await stub.fetch("https://do/stream", {
            headers: { Accept: "text/event-stream" },
          });

          const headers = new Headers(doRes.headers);
          headers.set("Access-Control-Allow-Origin", "*");

          return new Response(doRes.body, {
            status: doRes.status,
            headers,
          });
        }

        if (parts[3] === "roster") {
          return json(pb.roster || []);
        }

        if (parts[3] === "signup" && request.method === "POST") {
          const body = await request.json();

          if (pb.roster.some((p) => p.name === body.name)) {
            return json({ ok: false, error: "Name already signed up" }, 400);
          }

          pb.roster.push({
            name: body.name,
            ship: body.ship,
            br: body.br,
            createdBy: body.createdBy,
          });

          await savePB(id, pb);
          await stub.fetch("https://do/bump", { method: "POST" });

          return json({ ok: true });
        }

        if (
          (parts[3] === "remove" || parts[3] === "withdraw") &&
          request.method === "DELETE"
        ) {
          const name = decodeURIComponent(parts[4]);
          pb.roster = pb.roster.filter((p) => p.name !== name);

          await savePB(id, pb);
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
              screening: body.screening || [],
            }),
          });

          const doData = await doRes.json();
          return json(doData, doRes.ok ? 200 : 400);
        }

        if (parts[3] === "update" && request.method === "POST") {
          const body = await request.json();

          pb.name = body.name;
          pb.date = body.date;
          pb.time = body.time;
          pb.br = body.br;
          pb.water = body.water;

          await savePB(id, pb);

          const bumpRes = await stub.fetch("https://do/bump", {
            method: "POST",
          });
          const bumpData = await bumpRes.json();

          return json({ ok: true, assignVersion: bumpData.assignVersion });
        }

        if (parts.length === 3 && request.method === "DELETE") {
          await env.PB_KV.delete(id);
          await removeFromIndex(id);
          return json({ ok: true });
        }

        return json({ error: "Not found" }, 404);
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: "Internal error", detail: err.message }, 500);
    }
  },
};
