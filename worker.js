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

    async function savePB(kvKey, pb) {
      await env.PB.put(kvKey, JSON.stringify(pb));
    }

    // ---------------- SSE STREAM HANDLER (CLOUDFLARE-SAFE) ----------------
    async function streamPBUpdates(id, env) {
      const { pb } = await loadPBById(id);
      if (!pb) {
        return new Response("PB not found", { status: 404 });
      }

      const encoder = new TextEncoder();

      const headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      };

      return new Response(
        new ReadableStream({
          async start(controller) {
            let lastVersion = pb.assignVersion || 0;

            // Send initial state
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  assignVersion: lastVersion,
                  assignments: pb.assignments || { main: [], screening: [] }
                })}\n\n`
              )
            );

            // Loop forever, checking KV every 2 seconds
            while (true) {
              await new Promise(r => setTimeout(r, 2000));

              const { pb: updated } = await loadPBById(id);
              if (!updated) continue;

              if (updated.assignVersion !== lastVersion) {
                lastVersion = updated.assignVersion;

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      assignVersion: updated.assignVersion,
                      assignments: updated.assignments || { main: [], screening: [] }
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

    // ---------------- OFFICER PASSWORD (LOGIN + VERSION) ----------------

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

    // ---------------- PB ROUTES ----------------

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

      // DELETE PB
      if (parts.length === 3 && request.method === "DELETE") {
        const { pb, kvKey } = await loadPBById(id);
        if (!pb) return json({ ok: false, error: "PB not found" }, 404);

        await env.PB.delete(kvKey);
        return json({ ok: true });
      }

      const { pb, kvKey } = await loadPBById(id);
      if (!pb) return json({ error: "Not found" }, 404);

      // SSE STREAM ENDPOINT
      if (parts.length === 4 && parts[3] === "stream") {
        return streamPBUpdates(id, env);
      }

      // CONFIG
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

      // ROSTER
      if (parts.length === 4 && parts[3] === "roster") {
        return json(pb.roster || []);
      }

      // SIGNUP
      if (parts.length === 4 && parts[3] === "signup" && request.method === "POST") {
        const body = await request.json();
        pb.roster = pb.roster || [];

        if (pb.roster.some(p => p.name === body.name)) {
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

      // REMOVE FROM ROSTER
      if (parts.length === 5 && parts[3] === "remove" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter(p => p.name !== name);

        await savePB(kvKey, pb);
        return json({ ok: true });
      }

      // ASSIGN
      if (parts.length === 4 && parts[3] === "assign" && request.method === "POST") {
        const body = await request.json();
        const { main, screening } = body;

        const set = new Set();
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

      // UPDATE PB METADATA
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