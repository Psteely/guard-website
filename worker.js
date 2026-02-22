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

    // LIST PBs
    if (pathname === "/api/pb/list" && request.method === "GET") {
      const list = [];
      const { keys } = await env.PB.list();

      for (const k of keys) {
        const pb = await env.PB.get(k.name, { type: "json" });
        if (pb) {
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

    // CREATE PB
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
        assignments: null
      };

      await env.PB.put(id, JSON.stringify(pb));
      return json({ ok: true, id });
    }

    // PB ROUTES
    if (pathname.startsWith("/api/pb/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = parts[2];

      // SAFE DELETE
      if (parts.length === 3 && request.method === "DELETE") {
        const targetId = id;

        const { keys } = await env.PB.list();
        for (const k of keys) {
          const pb = await env.PB.get(k.name, { type: "json" });
          if (pb && pb.id === targetId) {
            await env.PB.delete(k.name);
            return json({ ok: true });
          }
        }

        return json({ ok: false, error: "PB not found in KV" }, 404);
      }

      const pb = await env.PB.get(id, { type: "json" });
      if (!pb) return json({ error: "Not found" }, 404);

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
          assignments: pb.assignments || null
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

        await env.PB.put(id, JSON.stringify(pb));
        return json({ ok: true });
      }

      // REMOVE FROM ROSTER
      if (parts.length === 5 && parts[3] === "remove" && request.method === "DELETE") {
        const name = decodeURIComponent(parts[4]);
        pb.roster = (pb.roster || []).filter(p => p.name !== name);

        await env.PB.put(id, JSON.stringify(pb));
        return json({ ok: true });
      }

      // ASSIGN
      if (parts.length === 4 && parts[3] === "assign" && request.method === "POST") {
        const body = await request.json();
        const { password, main, screening } = body;

        if (password !== "Nelson1798") {
          return json({ ok: false, error: "Forbidden" }, 403);
        }

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

        await env.PB.put(id, JSON.stringify(pb));
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    }

    return new Response("Not found", { status: 404, headers: cors });
  }
};