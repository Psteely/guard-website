export class PBRoom {
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

    const set = new Set();
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
      n => n !== name
    );
    this.assignments.screening = (this.assignments.screening || []).filter(
      n => n !== name
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
        start: async controller => {
          let lastVersion = this.version;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                assignVersion: lastVersion,
                assignments: this.assignments
              })}\n\n`
            )
          );

          while (true) {
            await new Promise(r => setTimeout(r, 2000));
            await this.init();
            if (this.version !== lastVersion) {
              lastVersion = this.version;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    assignVersion: this.version,
                    assignments: this.assignments
                  })}\n\n`
                )
              );
            }
          }
        }
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
}

export default {
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

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...cors }
      });

    // ------------------------------
    // Cloudflare Usage Endpoint
    // ------------------------------
    if (pathname === "/api/usage") {
      const today = new Date().toISOString().slice(0, 10);

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

      const requests =
        data?.data?.viewer?.accounts?.[0]?.workersInvocations?.[0]?.sum
          ?.requests || 0;

      return json({ requests, limit: 100000 });
    }

    // ------------------------------
    // PB INDEX HELPERS
    // ------------------------------
    async function loadIndex(env) {
      const raw = await env.PB.get("PB_INDEX", { type: "json" });
      return Array.isArray(raw) ? raw : [];
    }

    async function saveIndex(env, arr) {
      await env.PB.put("PB_INDEX", JSON.stringify(arr));
    }

    async function addToIndex(env, id) {
      const idx = await loadIndex(env);
      if (!idx.includes(id)) {
        idx.push(id);
        await saveIndex(env, idx);
      }
    }

    async function removeFromIndex(env, id) {
      const idx = await loadIndex(env);
      const filtered = idx.filter(x => x !== id);
      await saveIndex(env, filtered);
    }

    async function loadPB(env, id) {
      return await env.PB.get(id, { type: "json" });
    }

    async function savePB(env, id, pb) {
      await env.PB.put(id, JSON.stringify(pb));
    }

    function getRoomStub(env, id) {
      const roomId = env.PB_ROOM.idFromName(id);
      return env.PB_ROOM.get(roomId);
    }

    // ------------------------------
    // OFFICER PASSWORD
    // ------------------------------
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

    // ------------------------------
    // PB LIST
    // ------------------------------
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

    // ------------------------------
    // PB CREATE
    // ------------------------------
    if (pathname === "/api/pb/create" && request.method === "POST") {
      const body = await request.json();

      const id =
        crypto.randomUUID?.() ||
        crypto.getRandomValues(new Uint8Array(16)).join("");

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

    // ------------------------------
    // PB-SPECIFIC ROUTES
    // ------------------------------
    if (pathname.startsWith("/api/pb/")) {
      const parts = pathname.split("/").filter(Boolean); // ["api","pb",":id",...]
      const id = parts[2];

      const pb = await loadPB(env, id);
      if (!pb) return json({ error: "Not found" }, 404);

      const stub = getRoomStub(env, id);

      // ------------------------------
      // NEW: FULL SNAPSHOT ENDPOINT
      // ------------------------------
      if (parts[3] === "full" && request.method === "GET") {
        const doRes = await stub.fetch("https://do/state");
        const doData = await doRes.json();

        return json({
          ok: true,
          id: pb.id,
          name: pb.name,
          date: pb.date,
          time: pb.time,
          br: pb.br,
          water: pb.water,
          created: pb.created,
          roster: pb.roster || [],
          assignments: doData.assignments || { main: [], screening: [] },
          assignVersion: doData.assignVersion || 0
        });
      }

      // DELETE PB
      if (parts.length === 3 && request.method === "DELETE") {
        await env.PB.delete(id);
        await removeFromIndex(env, id);
        return json({ ok: true });
      }

      // STREAM (via DO)
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

      // CONFIG
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

      // ROSTER
      if (parts[3] === "roster" && request.method === "GET") {
        return json(pb.roster || []);
      }

      // SIGNUP
      if (parts[3] === "signup" && request.method === "POST") {
        const body = await request.json();
        const pbCurrent = await loadPB(env, id);

        pbCurrent.roster = pbCurrent.roster || [];

        if (pbCurrent.roster.some(p => p.name === body.name)) {
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

        const stub = getRoomStub(env, id);
        await stub.fetch("https://do/bump", { method: "POST" });

        return json({ ok: true });
      }

      // REMOVE (officer)
      if (parts[3] === "remove" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter(p => p.name !== name);
        await savePB(env, id, pb);

        await stub.fetch(
          `https://do/removeCaptain?name=${encodeURIComponent(name)}`,
          { method: "POST" }
        );

        return json({ ok: true });
      }

      // WITHDRAW (captain)
      if (parts[3] === "withdraw" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter(p => p.name !== name);
        await savePB(env, id, pb);

        await stub.fetch(
          `https://do/removeCaptain?name=${encodeURIComponent(name)}`,
          { method: "POST" }
        );

        return json({ ok: true });
      }

      // ASSIGN (via DO)
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

      // UPDATE PB METADATA
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
