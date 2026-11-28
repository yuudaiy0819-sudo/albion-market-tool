import { connect, StringCodec } from "nats";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeMessage, SUBJECTS } from "./normalize.js";

const NATS_SERVERS = process.env.NATS_SERVERS || "nats://public:thenewalbiondata@nats.albion-online-data.com:24222";
const INGEST_URL = process.env.INGEST_URL;
const INGEST_TOKEN = process.env.INGEST_TOKEN;
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 100);
const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS || 1500);
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 20000);
const SPOOL_FILE = process.env.SPOOL_FILE || "/data/queue.jsonl";
const codec = StringCodec();

if (!INGEST_URL || !INGEST_TOKEN) {
  throw new Error("INGEST_URL and INGEST_TOKEN must be configured");
}

const spoolDirectory = dirname(SPOOL_FILE);
mkdirSync(spoolDirectory, { recursive: true });
if (!existsSync(SPOOL_FILE)) writeFileSync(SPOOL_FILE, "");
let queue = readFileSync(SPOOL_FILE, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
function persistQueue() {
  writeFileSync(SPOOL_FILE, queue.map(event => JSON.stringify(event)).join("\n") + (queue.length ? "\n" : ""));
}
let inFlight = false;
let accepted = 0;
let rejected = 0;
let forwarded = 0;
let lastMessageAt = null;
let stopping = false;

async function forwardBatch(batch) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${INGEST_TOKEN}`
        },
        body: JSON.stringify({ events: batch })
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`ingest HTTP ${response.status}: ${detail}`);
      }
      const result = await response.json();
      forwarded += Number(result.inserted || 0);
      return;
    } catch (error) {
      lastError = error;
      const delay = Math.min(30000, 500 * (2 ** attempt));
      console.error("Ingest attempt failed", { attempt: attempt + 1, error: error.message });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // Do not silently discard an unforwarded batch.
  queue = batch.concat(queue);
  throw new Error(`Unable to forward batch after retries: ${lastError?.message || "unknown error"}`);
}

async function flush() {
  if (inFlight || queue.length === 0 || stopping) return;
  inFlight = true;
  try {
    while (queue.length > 0 && !stopping) {
      const batch = queue.splice(0, BATCH_SIZE);
      await forwardBatch(batch);
      persistQueue();
      console.log("Batch forwarded", {
        batchSize: batch.length,
        forwarded,
        queued: queue.length
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    stopping = true;
  } finally {
    inFlight = false;
  }
}

const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

async function main() {
  const nc = await connect({
    servers: NATS_SERVERS,
    name: "albion-market-tool-asia-collector",
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
    timeout: 10000
  });

  console.log("Connected to AODP Asia NATS", { servers: NATS_SERVERS.replace(/public:[^@]+@/, "public:***@") });
  (async () => {
    for await (const status of nc.status()) {
      console.log("NATS status", status.type, status.data || "");
    }
  })().catch(error => console.error("NATS status stream ended", error));

  for (const subject of SUBJECTS) {
    const sub = nc.subscribe(subject, { max: 20000 });
    (async () => {
      for await (const message of sub) {
        if (stopping) break;
        try {
          const payload = JSON.parse(codec.decode(message.data));
          const event = normalizeMessage(subject, payload);
          while (queue.length >= MAX_QUEUE && !stopping) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          if (stopping) break;
          // Persist before forwarding so restarts can resume the pending batch.
          appendFileSync(SPOOL_FILE, JSON.stringify(event) + "\n");
          queue.push(event);
          accepted++;
          lastMessageAt = new Date().toISOString();
          if (queue.length >= BATCH_SIZE) void flush();
        } catch (error) {
          rejected++;
          console.error("Rejected NATS message", { subject, error: error.message, rejected });
        }
      }
    })().catch(error => {
      console.error("Subscription ended", { subject, error: error.message });
      process.exitCode = 1;
      stopping = true;
    });
  }

  setInterval(() => {
    console.log("Collector heartbeat", {
      accepted, rejected, forwarded, queued: queue.length, lastMessageAt,
      nats: nc.isClosed() ? "closed" : "connected"
    });
  }, 60000);

  const shutdown = async signal => {
    if (stopping) return;
    console.log("Stopping collector", signal);
    stopping = true;
    clearInterval(flushTimer);
    while (inFlight) await new Promise(resolve => setTimeout(resolve, 100));
    while (queue.length > 0) {
      const batch = queue.splice(0, BATCH_SIZE);
      try {
        await forwardBatch(batch);
        persistQueue();
      } catch (error) {
        console.error("Shutdown drain failed; pending events remain on disk", error.message);
        break;
      }
    }
    await nc.drain();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(error => {
  console.error("Collector startup failed", error);
  process.exit(1);
});
