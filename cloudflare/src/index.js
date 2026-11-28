const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const AODP_BASE = "https://east.albion-online-data.com/api/v2";
const ALLOWED_CITIES = new Set([
  "Bridgewatch",
  "Fort Sterling",
  "Lymhurst",
  "Martlock",
  "Thetford",
  "Caerleon",
  "Brecilien",
  "Black Market"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

function isAuthorized(request, env) {
  return Boolean(
    env.ADMIN_TOKEN &&
    request.headers.get("authorization") === \`Bearer \${env.ADMIN_TOKEN}\`
  );
}

async function sendDiscord(webhookUrl, content) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(\`Discord webhook failed (\${response.status}): \${detail.slice(0, 300)}\`);
  }
}

function validItemId(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    /^[A-Za-z0-9_@.-]+$/.test(value);
}

function validQuality(value) {
  const quality = Number(value);
  return Number.isInteger(quality) && quality >= 1 && quality <= 5;
}

function isFreshPriceDate(value) {
  if (!value || value.startsWith("0001-01-01")) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= 6 * 60 * 60 * 1000 &&
    timestamp <= Date.now() + 5 * 60 * 1000;
}

async function getEnabledRules(db) {
  const result = await db.prepare(
    "SELECT * FROM watch_rules WHERE enabled = 1 ORDER BY created_at ASC"
  ).all();
  return result.results || [];
}

async function pollMarketData(env) {
  if (!env.DB) throw new Error("D1 database binding DB is missing");

  const rules = await getEnabledRules(env.DB);
  if (rules.length === 0) {
    return { ok: true, rules: 0, pricesFetched: 0, observationsSaved: 0, message: "No enabled watch rules" };
  }

  const itemIds = [...new Set(rules.map(rule => rule.item_id))];
  const cities = [...new Set(rules.flatMap(rule => [rule.buy_city, rule.sell_city]))];
  const qualities = [...new Set(rules.map(rule => Number(rule.quality)))];

  let pricesFetched = 0;
  let observationsSaved = 0;
  const errors = [];

  // Keep each request comfortably below the API URL length limit.
  for (let offset = 0; offset < itemIds.length; offset += 20) {
    const batchIds = itemIds.slice(offset, offset + 20);
    const itemPath = batchIds.map(id => encodeURIComponent(id)).join(",");
    const apiUrl = new URL(\`\${AODP_BASE}/stats/prices/\${itemPath}.json\`);
    apiUrl.searchParams.set("locations", cities.join(","));
    apiUrl.searchParams.set("qualities", qualities.join(","));

    let response;
    try {
      response = await fetch(apiUrl.toString(), {
        headers: { "accept": "application/json" }
      });
    } catch (error) {
      errors.push(\`AODP request failed: \${error.message}\`);
      continue;
    }

    if (!response.ok) {
      errors.push(\`AODP returned HTTP \${response.status}\`);
      continue;
    }

    let rows;
    try {
      rows = await response.json();
    } catch {
      errors.push("AODP returned invalid JSON");
      continue;
    }

    if (!Array.isArray(rows)) {
      errors.push("AODP response was not an array");
      continue;
    }

    pricesFetched += rows.length;
    const relevant = rows.filter(row =>
      batchIds.includes(row.item_id) &&
      cities.includes(row.city) &&
      qualities.includes(Number(row.quality))
    );

    for (const row of relevant) {
      await env.DB.prepare(
        \`INSERT INTO price_observations
          (item_id, city, quality, sell_price_min, buy_price_max,
           sell_price_min_date, buy_price_max_date, observed_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`
      ).bind(
        row.item_id,
        row.city,
        Number(row.quality),
        row.sell_price_min > 0 ? Number(row.sell_price_min) : null,
        row.buy_price_max > 0 ? Number(row.buy_price_max) : null,
        row.sell_price_min_date || null,
        row.buy_price_max_date || null,
        new Date().toISOString(),
        "AODP East"
      ).run();
      observationsSaved++;
    }
  }

  return {
    ok: errors.length === 0,
    rules: rules.length,
    pricesFetched,
    observationsSaved,
    errors
  };
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

    if (url.pathname.startsWith("/admin/") && !isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (request.method === "POST" && url.pathname === "/admin/test-discord") {
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

    if (request.method === "GET" && url.pathname === "/admin/watch-rules") {
      const rules = await env.DB.prepare(
        "SELECT * FROM watch_rules ORDER BY created_at DESC"
      ).all();
      return json({ rules: rules.results || [] });
    }

    if (request.method === "POST" && url.pathname === "/admin/watch-rules") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON" }, 400);
      }

      const { item_id, item_name, quality, buy_city, sell_city, min_spread } = body || {};
      if (!validItemId(item_id)) return json({ error: "Invalid item_id" }, 400);
      if (!validQuality(quality)) return json({ error: "quality must be 1-5" }, 400);
      if (!ALLOWED_CITIES.has(buy_city) || !ALLOWED_CITIES.has(sell_city) || buy_city === sell_city) {
        return json({ error: "Choose two different supported market cities" }, 400);
      }

      const id = crypto.randomUUID();
      const threshold = min_spread === undefined || min_spread === null ? 0 : Number(min_spread);
      if (!Number.isFinite(threshold) || threshold < 0) {
        return json({ error: "min_spread must be zero or a positive number" }, 400);
      }

      await env.DB.prepare(
        \`INSERT INTO watch_rules
          (id, item_id, item_name, quality, buy_city, sell_city, min_spread, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)\`
      ).bind(
        id,
        item_id,
        typeof item_name === "string" ? item_name.slice(0, 120) : null,
        Number(quality),
        buy_city,
        sell_city,
        threshold
      ).run();

      return json({ ok: true, id, message: "Watch rule created" }, 201);
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/admin/watch-rules/")) {
      const id = decodeURIComponent(url.pathname.slice("/admin/watch-rules/".length));
      if (!id || id.length > 100) return json({ error: "Invalid rule id" }, 400);
      const result = await env.DB.prepare("DELETE FROM watch_rules WHERE id = ?").bind(id).run();
      return json({ ok: true, deleted: result.meta?.changes || 0 });
    }

    if (request.method === "POST" && url.pathname === "/admin/poll-now") {
      try {
        const result = await pollMarketData(env);
        return json(result, result.ok ? 200 : 502);
      } catch (error) {
        console.error("Manual market poll failed", error);
        return json({ error: "Market poll failed", detail: error.message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      pollMarketData(env).then(result => {
        console.log("Albion market poll completed", {
          scheduledTime: controller.scheduledTime,
          cron: controller.cron,
          ...result
        });
      }).catch(error => {
        console.error("Albion market poll failed", error);
      })
    );
  }
};
