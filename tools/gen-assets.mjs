/**
 * Local asset generator for Brawl-offline using 302.ai (images).
 * Run: npm run gen:assets
 * Requires .env with AI302_API_KEY (never commit .env).
 *
 * Music: add .mp3 files under assets/music/ manually or extend this script
 * using https://api.302.ai/suno/* (async + poll) per 302.ai docs.
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

async function main() {
  loadDotEnv();
  const key = process.env.AI302_API_KEY;
  const cfgPath = path.join(__dirname, "assets.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const apiBase = cfg.apiBase || "https://api.302.ai";
  const model = cfg.imageModel || "gpt-image-1";

  if (!key) {
    console.warn("[gen-assets] No AI302_API_KEY — copy .env.example to .env. Skipping generation.");
    process.exit(0);
  }

  const manifest = { version: 1, generatedAt: new Date().toISOString(), sprites: [], music: [], sfx: [] };

  for (const item of cfg.images || []) {
    const outAbs = path.join(assetsDir, item.file);
    console.log("[gen-assets] image", item.id, "→", item.file);
    await generateImage(apiBase, key, item.model || model, item.prompt, outAbs);
    manifest.sprites.push({ id: item.id, src: item.file.replace(/\\/g, "/") });
    await new Promise((r) => setTimeout(r, 800));
  }

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log("[gen-assets] Done. Wrote assets/manifest.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
