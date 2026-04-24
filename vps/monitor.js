#!/usr/bin/env node
// Proxy health monitor — runs on VPS
// Polls Convex /proxy-health every 60s
// If warns > 3 in last 5 minutes → kills + restarts all proxy workers
//
// Setup:
//   CONVEX_URL=https://careful-bloodhound-344.convex.cloud node monitor.js
//   or: pm2 start monitor.js --name monitor

const { execSync, exec } = require("child_process");
const fs   = require("fs");
const path = require("path");

const CONVEX_URL    = process.env.CONVEX_URL || "https://careful-bloodhound-344.convex.cloud";
const HEALTH_URL    = `${CONVEX_URL}/proxy-health`;
const POLL_INTERVAL = 60_000;       // check every 60s
const WARN_THRESHOLD = 3;           // restarts if warns > this
const PROXY_DIR     = "/root/proxy";
const LOG_FILE      = `${PROXY_DIR}/monitor.log`;
const WORKERS       = 4;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

async function fetchHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) { log(`WARN health endpoint returned ${res.status}`); return null; }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    log(`WARN failed to reach health endpoint: ${e.message}`);
    return null;
  }
}

function getWorkerPids() {
  try {
    const out = execSync(`pgrep -f "node ${PROXY_DIR}/server.js"`, { encoding: "utf8" }).trim();
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function killWorkers() {
  const pids = getWorkerPids();
  if (pids.length === 0) { log("WARN no proxy workers found to kill"); return; }
  for (const pid of pids) {
    try {
      execSync(`kill -9 ${pid}`);
      log(`KILL pid ${pid}`);
    } catch (e) {
      log(`WARN could not kill pid ${pid}: ${e.message}`);
    }
  }
}

function startWorkers() {
  for (let i = 0; i < WORKERS; i++) {
    exec(`node ${PROXY_DIR}/server.js >> ${PROXY_DIR}/worker-${i}.log 2>&1 &`, (err) => {
      if (err) log(`WARN failed to start worker ${i}: ${err.message}`);
      else log(`START worker ${i}`);
    });
  }
}

function restartProxy(reason) {
  log(`RESTART triggered — reason: ${reason}`);
  killWorkers();
  // Small delay so OS releases ports before respawn
  setTimeout(() => {
    startWorkers();
    log(`RESTART complete — spawned ${WORKERS} workers`);
  }, 2_000);
}

let consecutiveWarnCycles = 0;

async function poll() {
  const health = await fetchHealth();

  if (!health) {
    log("SKIP could not fetch health data");
    return;
  }

  const { warns, total } = health;
  log(`STATUS warns=${warns} total=${total} (last 5 min)`);

  if (warns > WARN_THRESHOLD) {
    consecutiveWarnCycles++;
    log(`ALERT warn threshold exceeded (${warns} > ${WARN_THRESHOLD}) — cycle ${consecutiveWarnCycles}`);

    const recents = (health.recent || []).map(r =>
      `  ${new Date(r.t).toISOString()} | ${r.subs} | ${r.msg}`
    ).join("\n");
    if (recents) log(`RECENT WARNS:\n${recents}`);

    restartProxy(`${warns} warns in last 5 min`);
    consecutiveWarnCycles = 0;
  } else {
    if (consecutiveWarnCycles > 0) log(`OK warn count back to normal`);
    consecutiveWarnCycles = 0;
  }
}

log(`BOOT monitor started | polling every ${POLL_INTERVAL / 1000}s | threshold=${WARN_THRESHOLD} warns`);
log(`BOOT health endpoint: ${HEALTH_URL}`);
log(`BOOT proxy dir: ${PROXY_DIR}`);

poll(); // immediate first check
setInterval(poll, POLL_INTERVAL);
