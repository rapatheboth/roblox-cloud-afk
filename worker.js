const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store"
  }
});

async function readState(env) {
  if (env.AFK_KV) {
    const value = await env.AFK_KV.get("dashboard_state", "json");
    return value || { desiredState: "stopped", runner: null, updatedAt: null };
  }
  return { desiredState: "stopped", runner: null, updatedAt: null,
    warning: "KV belum dipasang. Status hanya sementara dan dapat kembali default." };
}
async function writeState(env, state) {
  if (!env.AFK_KV) throw new Error("KV belum dikonfigurasi. Buat KV namespace lalu binding dengan nama AFK_KV.");
  await env.AFK_KV.put("dashboard_state", JSON.stringify(state));
}
function authorized(request, env) {
  if (!env.DASHBOARD_KEY) return false;
  return request.headers.get("Authorization") === `Bearer ${env.DASHBOARD_KEY}`;
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }});
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "Roblox Cloud AFK Dashboard API", note: "API status only; does not run Roblox." });
    }
    if (url.pathname === "/api/status" && request.method === "GET") {
      const state = await readState(env);
      return json({ ok: true, ...state });
    }
    if (url.pathname === "/api/command" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "API key tidak valid atau DASHBOARD_KEY belum diatur." }, 401);
      if (!env.AFK_KV) return json({ error: "KV belum dikonfigurasi. Ikuti README." }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ error: "JSON tidak valid." }, 400); }
      if (!["start", "stop"].includes(body.action)) return json({ error: "Action harus start atau stop." }, 400);
      const state = await readState(env);
      state.desiredState = body.action === "start" ? "running" : "stopped";
      state.updatedAt = new Date().toISOString();
      await writeState(env, state);
      return json({ ok: true, ...state, note: "Perintah status tersimpan; ini tidak menjalankan game." });
    }
    if (url.pathname === "/api/heartbeat" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "API key tidak valid." }, 401);
      if (!env.AFK_KV) return json({ error: "KV belum dikonfigurasi." }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ error: "JSON tidak valid." }, 400); }
      const state = await readState(env);
      state.runner = {
        label: String(body.label || "External runner").slice(0, 60),
        lastHeartbeat: new Date().toISOString()
      };
      await writeState(env, state);
      return json({ ok: true, runner: state.runner });
    }
    return json({ error: "Endpoint tidak ditemukan." }, 404);
  }
};
