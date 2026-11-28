const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "albion-market-monitor",
        region: "east",
        timestamp: new Date().toISOString(),
        databaseConfigured: Boolean(env.DB)
      });
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    // Monitoring is intentionally not activated until watch rules and
    // notification settings are configured.
    console.log("Albion market monitor scheduled tick", {
      scheduledTime: controller.scheduledTime,
      cron: controller.cron
    });
  }
};
