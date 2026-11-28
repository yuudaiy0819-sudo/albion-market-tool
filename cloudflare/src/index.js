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

async function sendDiscord(webhookUrl, content) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${detail.slice(0, 300)}`);
  }
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
        databaseConfigured: Boolean(env.DB),
        discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL),
        adminTokenConfigured: Boolean(env.ADMIN_TOKEN)
      });
    }

    // Manual test endpoint. Keep it protected so visitors cannot use the
    // public Worker URL to send arbitrary messages through the Discord webhook.
    if (request.method === "POST" && url.pathname === "/admin/test-discord") {
      if (!env.ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ error: "Unauthorized" }, 401);
      }

      if (!env.DISCORD_WEBHOOK_URL) {
        return json({ error: "DISCORD_WEBHOOK_URL is not configured" }, 503);
      }

      try {
        await sendDiscord(
          env.DISCORD_WEBHOOK_URL,
          "✅ **Albion Market Monitor**\nDiscord通知テストに成功しました！Workerからの通知を受信できています。"
        );
        return json({ ok: true, message: "Discord test notification sent" });
      } catch (error) {
        console.error("Discord test failed", error);
        return json({ error: "Discord notification failed", detail: error.message }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    // Price monitoring will be enabled after watch rules are added.
    console.log("Albion market monitor scheduled tick", {
      scheduledTime: controller.scheduledTime,
      cron: controller.cron,
      databaseConfigured: Boolean(env.DB),
      discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL)
    });
  }
};
