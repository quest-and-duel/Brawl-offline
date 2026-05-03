/**
 * Local asset generator for Brawl-offline using 302.ai (images + Suno music).
 * Run: npm run gen:assets
 * Requires .env with AI302_API_KEY (never commit .env).
 *
 * Music: POST https://api.302.ai/suno/submit/music then GET .../suno/fetch/{task_id}
 * (see https://doc.302.ai — Suno custom / fetch).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const assetsDir = path.join(root, "assets");

function loadDotEnv() {
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[k] = v;
  }
}

async function downloadToFile(url, outAbs) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download ${url}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, buf);
}

async function generateImage(apiBase, key, model, prompt, outAbs) {
  const res = await fetch(`${apiBase}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Image API ${res.status}: ${text.slice(0, 500)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON: ${text.slice(0, 200)}`);
  }
  const d0 = json.data?.[0];
  if (d0?.b64_json) {
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, Buffer.from(d0.b64_json, "base64"));
    return;
  }
  if (d0?.url) {
    await downloadToFile(d0.url, outAbs);
    return;
  }
  throw new Error(`Unexpected image response: ${JSON.stringify(json).slice(0, 400)}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function deepFindAudioUrl(obj, depth = 0) {
  if (depth > 14 || obj == null) return null;
  if (typeof obj === "string") {
    if (/^https?:\/\/.+\.(mp3|wav|m4a|flac)(\?|$)/i.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const u = deepFindAudioUrl(it, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (typeof obj === "object") {
    for (const k of ["audio_url", "source_audio_url", "stream_audio_url", "url"]) {
      const u = obj[k];
      if (typeof u === "string" && u.startsWith("http")) return u;
    }
    for (const v of Object.values(obj)) {
      const u = deepFindAudioUrl(v, depth + 1);
      if (u) return u;
    }
  }
  return null;
}

async function sunoSubmitMusic(apiBase, key, item) {
  const instrumental = item.make_instrumental !== false;
  const body = {
    tags: item.tags,
    mv: item.mv || "chirp-crow",
    title: item.title,
    make_instrumental: instrumental,
    metadata: { create_mode: "custom" },
  };
  if (!instrumental && item.prompt) body.prompt = item.prompt;
  const res = await fetch(`${apiBase}/suno/submit/music`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Suno submit non-JSON ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok || json.code !== 0) {
    throw new Error(`Suno submit ${res.status} code=${json.code}: ${json.message || text.slice(0, 300)}`);
  }
  const taskId = typeof json.data === "string" ? json.data : json.data?.task_id;
  if (!taskId) throw new Error(`Suno submit: no task id in ${JSON.stringify(json).slice(0, 400)}`);
  return taskId;
}

async function sunoFetchTask(apiBase, key, taskId) {
  const res = await fetch(`${apiBase}/suno/fetch/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Suno fetch non-JSON ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) throw new Error(`Suno fetch ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

function sunoTaskLooksComplete(json) {
  const st = json?.data?.status ?? json?.data?.state ?? "";
  const s = String(st).toLowerCase();
  if (s.includes("fail") || s.includes("error")) return { done: true, failed: true, reason: json?.data?.fail_reason || json?.message };
  if (s === "complete" || s === "success" || s === "succeeded" || s === "finished") return { done: true, failed: false };
  return { done: false, failed: false };
}

async function generateMusicTrack(apiBase, key, item, outAbs) {
  const taskId = await sunoSubmitMusic(apiBase, key, item);
  console.log("[gen-assets] suno task", taskId);
  const maxWait = item.pollSeconds ?? 420;
  const step = item.pollIntervalMs ?? 3000;
  let waited = 0;
  let url = null;
  while (waited < maxWait) {
    await sleep(step);
    waited += step / 1000;
    const j = await sunoFetchTask(apiBase, key, taskId);
    const { done, failed, reason } = sunoTaskLooksComplete(j);
    if (failed) throw new Error(`Suno task failed: ${reason || JSON.stringify(j).slice(0, 300)}`);
    url = deepFindAudioUrl(j?.data);
    if (done && url) break;
    if (done && !url) {
      url = deepFindAudioUrl(j);
      if (url) break;
      throw new Error(`Suno complete but no audio URL: ${JSON.stringify(j).slice(0, 500)}`);
    }
  }
  if (!url) throw new Error("Suno: timeout waiting for audio URL");
  await downloadToFile(url, outAbs);
}

async function main() {
  loadDotEnv();
  const key = process.env.AI302_API_KEY;
  const cfgPath = path.join(__dirname, "assets.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const apiBase = (cfg.apiBase || "https://api.302.ai").replace(/\/$/, "");
  const model = cfg.imageModel || "gpt-image-1";

  const prevPath = path.join(assetsDir, "manifest.json");
  let prev = { sprites: [], music: [], sfx: [] };
  try {
    if (fs.existsSync(prevPath)) prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
  } catch {
    /* ignore */
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sprites: (cfg.images || []).length ? [] : (prev.sprites || []),
    music: [],
    sfx: prev.sfx || [],
  };

  if (!key) {
    console.warn("[gen-assets] No AI302_API_KEY — copy .env.example to .env. Skipping generation.");
    process.exit(0);
  }

  for (const item of cfg.images || []) {
    const outAbs = path.join(assetsDir, item.file);
    console.log("[gen-assets] image", item.id, "→", item.file);
    await generateImage(apiBase, key, item.model || model, item.prompt, outAbs);
    manifest.sprites.push({ id: item.id, src: item.file.replace(/\\/g, "/") });
    await sleep(800);
  }

  const musicIds = new Set();
  for (const item of cfg.music || []) {
    const outAbs = path.join(assetsDir, item.file);
    const rel = item.file.replace(/\\/g, "/");
    if (item.skip) {
      if (fs.existsSync(outAbs)) {
        manifest.music.push({ id: item.id, src: rel });
        musicIds.add(item.id);
      } else console.log("[gen-assets] music skip (no file):", item.id);
      continue;
    }
    console.log("[gen-assets] music (Suno)", item.id, "→", item.file);
    await generateMusicTrack(apiBase, key, item, outAbs);
    manifest.music.push({ id: item.id, src: rel });
    musicIds.add(item.id);
    await sleep(1200);
  }
  for (const m of prev.music || []) {
    if (!musicIds.has(m.id)) {
      manifest.music.push(m);
      musicIds.add(m.id);
    }
  }

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(prevPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("[gen-assets] Done. Wrote assets/manifest.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
