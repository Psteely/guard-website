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

    // ------------------------------
    // SSE STREAM
    // ------------------------------

    async function streamPBUpdates(id, env) {
      const pb = await loadPB(env, id);
      if (!pb) return new Response("PB not found", { status: 404, headers: cors });

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

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  assignVersion: lastVersion,
                  assignments: pb.assignments || { main: [], screening: [] }
                })}\n\n`
              )
            );

            while (true) {
              await new Promise(r => setTimeout(r, 2000));

              const updated = await loadPB(env, id);
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
      return json({ ok: data?.password === password, version: data?.version || 0 });
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
    // PB LIST (NO KV.list())
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
        roster: [],
        assignments: null,
        assignVersion: 0
      };

      await savePB(env, id, pb);
      await addToIndex(env, id);

      return json({ ok: true, id });
    }

    // ------------------------------
    // PB-SPECIFIC ROUTES
    // ------------------------------

    if (pathname.startsWith("/api/pb/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = parts[2];

      const pb = await loadPB(env, id);
      if (!pb) return json({ error: "Not found" }, 404);

      // DELETE PB
      if (parts.length === 3 && request.method === "DELETE") {
        await env.PB.delete(id);
        await removeFromIndex(env, id);
        return json({ ok: true });
      }

      // STREAM
      if (parts[3] === "stream") {
        return streamPBUpdates(id, env);
      }

      // CONFIG
      if (parts[3] === "config") {
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
      if (parts[3] === "roster" && request.method === "GET") {
        return json(pb.roster || []);
      }

      // SIGNUP
      if (parts[3] === "signup" && request.method === "POST") {
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

        await savePB(env, id, pb);
        return json({ ok: true });
      }

      // REMOVE (officer)
      if (parts[3] === "remove" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter(p => p.name !== name);

        await savePB(env, id, pb);
        return json({ ok: true });
      }

      // WITHDRAW (captain)
      if (parts[3] === "withdraw" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);

        pb.roster = (pb.roster || []).filter(p => p.name !== name);

        if (pb.assignments) {
          pb.assignments.main = (pb.assignments.main || []).filter(n => n !== name);
          pb.assignments.screening = (pb.assignments.screening || []).filter(n => n !== name);
        }

        pb.assignVersion = (pb.assignVersion || 0) + 1;

        await savePB(env, id, pb);
        return json({ ok: true });
      }

      // ASSIGN
      if (parts[3] === "assign" && request.method === "POST") {
        const { main, screening } = await request.json();

        const set = new Set();
        for (const n of main || []) set.add(n);
        for (const n of screening || []) {
          if (set.has(n)) {
            return json({ ok: false, error: "Duplicate captain in both groups" }, 400);
          }
        }

        pb.assignments = {
          main: main || [],
          screening: screening || []
        };

        pb.assignVersion = (pb.assignVersion || 0) + 1;

        await savePB(env, id, pb);
        return json({ ok: true, assignVersion: pb.assignVersion });
      }

      // UPDATE PB METADATA
      if (parts[3] === "update" && request.method === "POST") {
        const { name, date, time, br, water } = await request.json();

        pb.name = name;
        pb.date = date;
        pb.time = time;
        pb.br = br;
        pb.water = water;

        pb.assignVersion = (pb.assignVersion || 0) + 1;

        await savePB(env, id, pb);
        return json({ ok: true, assignVersion: pb.assignVersion });
      }

      return json({ error: "Not found" }, 404);
    }

    return new Response("Not found", { status: 404, headers: cors });
  }
};