const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type"
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
    request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`
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
    throw new Error(`Discord webhook failed (${response.status}): ${detail.slice(0, 300)}`);
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


function orderbookOrders(record, keys) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) return record[key];
  }
  return null;
}

function orderAmount(order) {
  const amount = Number(order?.amount ?? order?.quantity ?? order?.volume ?? order?.count);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function historyTimestamp(value) {
  if (typeof value === "number") {
    if (value > 600000000000000000) return (value - 621355968000000000) / 10000;
    if (value > 1000000000000) return value;
    return value * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// One history + one order-book request per item/quality; reuse the result for all eight cities.
async function fetchLowStockData(itemId, quality) {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 86400000);
  const date = value => value.toISOString().slice(0, 10);
  const historyUrl = new URL(`${AODP_BASE}/stats/history/${encodeURIComponent(itemId)}.json`);
  historyUrl.searchParams.set("locations", [...ALLOWED_CITIES].join(","));
  historyUrl.searchParams.set("qualities", String(quality));
  historyUrl.searchParams.set("date", date(start));
  historyUrl.searchParams.set("end_date", date(now));
  historyUrl.searchParams.set("time-scale", "6");

  const orderbookUrl = new URL(`${AODP_BASE}/stats/orderbook/${encodeURIComponent(itemId)}.json`);
  orderbookUrl.searchParams.set("locations", [...ALLOWED_CITIES].join(","));
  orderbookUrl.searchParams.set("qualities", String(quality));

  const [historyResponse, orderbookResponse] = await Promise.all([
    fetch(historyUrl.toString(), { headers: { accept: "application/json" } }),
    fetch(orderbookUrl.toString(), { headers: { accept: "application/json" } })
  ]);
  if (!historyResponse.ok) throw new Error(`history HTTP ${historyResponse.status}`);
  if (!orderbookResponse.ok) throw new Error(`orderbook HTTP ${orderbookResponse.status}`);

  const historyPayload = await historyResponse.json();
  const orderbookPayload = await orderbookResponse.json();
  const historyRecords = Array.isArray(historyPayload) ? historyPayload :
    (historyPayload?.data || historyPayload?.series || []);
  const orderbookRecords = Array.isArray(orderbookPayload) ? orderbookPayload :
    (orderbookPayload?.data || orderbookPayload?.orderbooks || orderbookPayload?.orderBooks || []);

  const volumeByCity = new Map();
  for (const record of historyRecords) {
    const city = record.location || record.city || record.Location;
    if (!ALLOWED_CITIES.has(city) || Number(record.quality ?? record.Quality ?? quality) !== Number(quality)) continue;
    const points = Array.isArray(record.data) ? record.data : (record.Data || []);
    let count = 0;
    let known = 0;
    for (const point of points) {
      const timestamp = historyTimestamp(point.timestamp ?? point.Timestamp);
      const raw = point.item_count ?? point.ItemCount;
      const value = raw == null ? null : Number(raw);
      if (timestamp === null || timestamp < start.getTime() || timestamp > now.getTime() + 3600000) continue;
      if (value !== null && Number.isFinite(value) && value >= 0) {
        count += value;
        known++;
      }
    }
    if (known > 0) volumeByCity.set(city, { averageDaily: count / 7, buckets: known });
  }

  const stockByCity = new Map();
  for (const record of orderbookRecords) {
    const city = record.location || record.city || record.Location;
    if (!ALLOWED_CITIES.has(city) || Number(record.quality ?? record.Quality ?? quality) !== Number(quality)) continue;
    const sellOrders = orderbookOrders(record, ["sell_orders", "sellOrders", "asks", "sell"]);
    if (!sellOrders) continue; // Missing data is unknown, never zero stock.
    const quantities = sellOrders.map(orderAmount).filter(value => value !== null);
    if (quantities.length !== sellOrders.length) continue;
    stockByCity.set(city, quantities.reduce((sum, value) => sum + value, 0));
  }

  const result = new Map();
  for (const city of ALLOWED_CITIES) {
    const volume = volumeByCity.get(city);
    const stock = stockByCity.get(city);
    if (volume && volume.buckets >= 2 && stock !== undefined) {
      result.set(city, { averageDaily: volume.averageDaily, sellQuantity: stock, buckets: volume.buckets });
    }
  }
  return result;
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
    const apiUrl = new URL(`${AODP_BASE}/stats/prices/${itemPath}.json`);
    apiUrl.searchParams.set("locations", cities.join(","));
    apiUrl.searchParams.set("qualities", qualities.join(","));

    let response;
    try {
      response = await fetch(apiUrl.toString(), {
        headers: { "accept": "application/json" }
      });
    } catch (error) {
      errors.push(`AODP request failed: ${error.message}`);
      continue;
    }

    if (!response.ok) {
      errors.push(`AODP returned HTTP ${response.status}`);
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
        `INSERT INTO price_observations
          (item_id, city, quality, sell_price_min, buy_price_max,
           sell_price_min_date, buy_price_max_date, observed_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  let alertsSent = 0;
  const alertErrors = [];
  const lowStockCache = new Map();
  for (const rule of rules) {
    const key = `${rule.item_id}|${Number(rule.quality)}`;
    if (!lowStockCache.has(key)) {
      try {
        lowStockCache.set(key, await fetchLowStockData(rule.item_id, Number(rule.quality)));
      } catch (error) {
        lowStockCache.set(key, null);
        alertErrors.push(`Low-stock data ${key}: ${error.message}`);
      }
    }
  }

  if (env.DISCORD_WEBHOOK_URL) {
    for (const rule of rules) {
      try {
        // Buy in buy_city from sell orders; sell in sell_city into buy orders.
        const [buyResult, sellResult] = await Promise.all([
          env.DB.prepare(
            `SELECT sell_price_min, sell_price_min_date, observed_at
             FROM price_observations
             WHERE item_id = ? AND city = ? AND quality = ? AND sell_price_min IS NOT NULL
             ORDER BY observed_at DESC, id DESC LIMIT 2`
          ).bind(rule.item_id, rule.buy_city, Number(rule.quality)).all(),
          env.DB.prepare(
            `SELECT buy_price_max, buy_price_max_date, observed_at
             FROM price_observations
             WHERE item_id = ? AND city = ? AND quality = ? AND buy_price_max IS NOT NULL
             ORDER BY observed_at DESC, id DESC LIMIT 1`
          ).bind(rule.item_id, rule.sell_city, Number(rule.quality)).all()
        ]);

        const buyRows = buyResult.results || [];
        const sellRow = (sellResult.results || [])[0];
        const buyRow = buyRows[0];

        // Do not alert from stale or missing market observations.
        const isRecent = value => {
          if (!value || value.startsWith("0001-01-01")) return false;
          const timestamp = Date.parse(value);
          return Number.isFinite(timestamp) &&
            Date.now() - timestamp <= 60 * 60 * 1000 &&
            timestamp <= Date.now() + 5 * 60 * 1000;
        };

        const isCoolingDown = async alertType => {
          const recent = await env.DB.prepare(
            `SELECT COUNT(*) AS count FROM alert_events
             WHERE watch_rule_id = ? AND alert_type = ?
             AND created_at >= datetime('now', '-60 minutes')`
          ).bind(rule.id, alertType).first();
          return Number(recent?.count || 0) > 0;
        };

        const itemName = rule.item_name || rule.item_id;
        const qualityLabel = `品質 ${rule.quality}`;

        // Check sell-order stock in every supported city. AODP item_count is an
        // observed-volume indicator, not a complete record of completed trades.
        const lowStockCities = lowStockCache.get(`${rule.item_id}|${Number(rule.quality)}`);
        if (lowStockCities) {
          for (const [city, stock] of lowStockCities.entries()) {
            if (stock.averageDaily <= 0 || stock.sellQuantity > stock.averageDaily * 0.10) continue;
            const recentCityAlert = await env.DB.prepare(
              `SELECT COUNT(*) AS count FROM alert_events
               WHERE watch_rule_id = ? AND alert_type = 'low_sell_stock'
               AND message LIKE ? AND created_at >= datetime('now', '-60 minutes')`
            ).bind(rule.id, `%都市：${city}%`).first();
            if (Number(recentCityAlert?.count || 0) > 0) continue;

            const message =
              `📦 **Albion売却注文の在庫不足の可能性**\\n` +
              `アイテム：${itemName}（${qualityLabel}）\\n` +
              `都市：${city}\\n` +
              `現在の売却注文数量：${Math.round(stock.sellQuantity).toLocaleString()} 個\\n` +
              `過去7日間の1日平均数量目安：${Math.round(stock.averageDaily).toLocaleString()} 個\\n` +
              `平均比：${(stock.sellQuantity / stock.averageDaily * 100).toFixed(1)}%（通知基準：10%以下）\\n` +
              `※AODPの観測データによる参考値です。全取引・全注文を保証するものではありません。`;
            await sendDiscord(env.DISCORD_WEBHOOK_URL, message);
            await env.DB.prepare(
              `INSERT INTO alert_events
                (watch_rule_id, alert_type, message, source_observed_at, delivered_at)
               VALUES (?, 'low_sell_stock', ?, ?, ?)`
            ).bind(rule.id, message, new Date().toISOString(), new Date().toISOString()).run();
            alertsSent++;
          }
        }

        if (
          buyRow && sellRow &&
          Number(buyRow.sell_price_min) > 0 &&
          Number(sellRow.buy_price_max) > 0 &&
          isRecent(buyRow.sell_price_min_date) &&
          isRecent(sellRow.buy_price_max_date)
        ) {
          const buyPrice = Number(buyRow.sell_price_min);
          const sellPrice = Number(sellRow.buy_price_max);
          const spread = sellPrice - buyPrice;
          const threshold = Number(rule.min_spread || 0);
          // Instant buy from an existing sell order has no setup fee.
          // Instant sell into an existing buy order pays sales tax only.
          // Default is 4% for Premium; override with MARKET_SALES_TAX_RATE if needed.
          const configuredTaxRate = Number(env.MARKET_SALES_TAX_RATE ?? 4);
          const salesTaxRate = Number.isFinite(configuredTaxRate) &&
            configuredTaxRate >= 0 && configuredTaxRate <= 100
            ? configuredTaxRate
            : 4;
          const salesTax = Math.round(sellPrice * salesTaxRate / 100);
          const netProfit = sellPrice - salesTax - buyPrice;
          const profitRate = buyPrice > 0 ? (netProfit / buyPrice) * 100 : 0;

          if (spread >= threshold && !(await isCoolingDown("spread"))) {
            const message =
              `📈 **Albion価格差アラート**\n` +
              `アイテム：${itemName}（${qualityLabel}）\n` +
              `購入：${rule.buy_city} / ${buyPrice.toLocaleString()}\n` +
              `売却：${rule.sell_city} / ${sellPrice.toLocaleString()}\n` +
              `価格差：${spread.toLocaleString()}\n` +
              `販売税（${salesTaxRate}%）：-${salesTax.toLocaleString()}\n` +
              `**税引後利益：${netProfit.toLocaleString()} シルバー（${profitRate.toFixed(2)}%）**\n` +
              `※既存注文への即時購入・即時売却を想定。輸送コスト・価格変動は含みません。\n` +
              `（価格差の設定値：${threshold.toLocaleString()}以上）`;
            await sendDiscord(env.DISCORD_WEBHOOK_URL, message);
            await env.DB.prepare(
              `INSERT INTO alert_events
                (watch_rule_id, alert_type, message, buy_price, sell_price, spread, source_observed_at, delivered_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              rule.id, "spread", message, buyPrice, sellPrice, spread,
              new Date().toISOString(), new Date().toISOString()
            ).run();
            alertsSent++;
          }
        }

        // Notify when the price to buy from sell orders in buy_city falls.
        if (Number(rule.notify_on_buy_price_drop ?? 1) === 1 && buyRows.length >= 2) {
          const current = buyRows[0];
          const previous = buyRows[1];
          const currentPrice = Number(current.sell_price_min);
          const previousPrice = Number(previous.sell_price_min);

          if (
            currentPrice > 0 && previousPrice > 0 &&
            currentPrice < previousPrice &&
            isRecent(current.sell_price_min_date) &&
            isRecent(previous.sell_price_min_date) &&
            current.sell_price_min_date !== previous.sell_price_min_date &&
            !(await isCoolingDown("buy_price_drop"))
          ) {
            const drop = previousPrice - currentPrice;
            const message =
              `📉 **Albion購入価格の下落通知**\n` +
              `アイテム：${itemName}（${qualityLabel}）\n` +
              `都市：${rule.buy_city}\n` +
              `価格：${previousPrice.toLocaleString()} → **${currentPrice.toLocaleString()}**\n` +
              `下落：${drop.toLocaleString()}`;
            await sendDiscord(env.DISCORD_WEBHOOK_URL, message);
            await env.DB.prepare(
              `INSERT INTO alert_events
                (watch_rule_id, alert_type, message, buy_price, source_observed_at, delivered_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
              rule.id, "buy_price_drop", message, currentPrice,
              current.sell_price_min_date, new Date().toISOString()
            ).run();
            alertsSent++;
          }
        }
      } catch (error) {
        alertErrors.push(`Rule ${rule.id}: ${error.message}`);
      }
    }
  } else {
    alertErrors.push("DISCORD_WEBHOOK_URL is not configured");
  }

  return {
    ok: errors.length === 0 && alertErrors.length === 0,
    rules: rules.length,
    pricesFetched,
    observationsSaved,
    alertsSent,
    errors: [...errors, ...alertErrors]
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

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

    if (request.method === "POST" && url.pathname === "/admin/test-spread") {
      if (!env.DISCORD_WEBHOOK_URL) {
        return json({ error: "DISCORD_WEBHOOK_URL is not configured" }, 503);
      }
      try {
        const rules = await getEnabledRules(env.DB);
        if (!rules.length) return json({ error: "先に監視ルールを1件登録してください。" }, 400);
        const rule = rules[0];
        const threshold = Number(rule.min_spread || 0);
        const buyPrice = 10000;
        const spread = Math.max(1500, threshold + 500);
        const sellPrice = buyPrice + spread;
        const itemName = rule.item_name || rule.item_id;
        const message =
          `🧪 **【テスト】Albion価格差アラート**\n` +
          `アイテム：${itemName}（品質 ${rule.quality}）\n` +
          `購入：${rule.buy_city} / ${buyPrice.toLocaleString()}\n` +
          `売却：${rule.sell_city} / ${sellPrice.toLocaleString()}\n` +
          `価格差：**${spread.toLocaleString()}**（設定値：${threshold.toLocaleString()}以上）\n` +
          `※これは通知テスト用の架空価格です。実際の市場データ・監視履歴には保存していません。`;
        await sendDiscord(env.DISCORD_WEBHOOK_URL, message);
        return json({ ok: true, message: "Synthetic spread test notification sent", spread });
      } catch (error) {
        console.error("Synthetic spread test failed", error);
        return json({ error: "テスト通知を送信できませんでした。", detail: error.message }, 502);
      }
    }

    if (request.method === "GET" && url.pathname === "/admin/alert-events") {
      const requestedLimit = Number(url.searchParams.get("limit") || 100);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
      const alertType = url.searchParams.get("type");
      const allowedTypes = new Set(["spread", "buy_price_drop", "low_sell_stock"]);
      let query = `
        SELECT e.id, e.watch_rule_id, e.alert_type, e.message,
               e.buy_price, e.sell_price, e.spread,
               e.source_observed_at, e.created_at, e.delivered_at,
               w.item_name, w.item_id, w.quality, w.buy_city, w.sell_city
        FROM alert_events e
        LEFT JOIN watch_rules w ON w.id = e.watch_rule_id
      `;
      const bindings = [];
      if (allowedTypes.has(alertType)) {
        query += " WHERE e.alert_type = ?";
        bindings.push(alertType);
      }
      query += " ORDER BY e.created_at DESC, e.id DESC LIMIT ?";
      bindings.push(limit);
      const result = await env.DB.prepare(query).bind(...bindings).all();
      return json({ events: result.results || [] });
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
        `INSERT INTO watch_rules
          (id, item_id, item_name, quality, buy_city, sell_city, min_spread, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
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
