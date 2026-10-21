#!/usr/bin/env node

// Tells Bing (and the other IndexNow engines) which pages changed, so updates
// reach Bing — and ChatGPT and Copilot search, which use it — without waiting
// for a recrawl. Run after a deploy:
//   npm run indexnow -- https://speedxrental.com [--only=auto-repair] [--dry-run]

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_FILE = /^indexnow-([0-9a-f]{32})\.txt$/;

/** The key is the name (and content) of public/indexnow-<key>.txt, served at the site root. */
export function readKey(publicDir) {
  const file = readdirSync(publicDir).find((name) => KEY_FILE.test(name));
  if (!file) throw new Error(`No indexnow-<key>.txt in ${publicDir}`);
  const key = file.match(KEY_FILE)[1];
  if (readFileSync(join(publicDir, file), "utf8").trim() !== key) {
    throw new Error(`${file} must contain exactly its key`);
  }
  return { key, fileName: file };
}

export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url.trim());
}

export function selectUrls(urls, origin, only) {
  const host = new URL(origin).host;
  return [...new Set(urls)].filter((url) => {
    const parsed = new URL(url);
    return parsed.host === host && (!only || parsed.pathname.includes(only));
  });
}

export function buildPayload(urls, origin, { key, fileName }) {
  const base = new URL(origin);
  return {
    host: base.host,
    key,
    keyLocation: new URL(`/${fileName}`, base).href,
    urlList: urls,
  };
}

async function main(argv) {
  const origin = argv.find((arg) => !arg.startsWith("--")) ?? "https://speedxrental.com";
  const only = argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const dryRun = argv.includes("--dry-run");
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  const keyInfo = readKey(publicDir);

  const keyUrl = new URL(`/${keyInfo.fileName}`, origin).href;
  const served = await fetch(keyUrl).then((res) => (res.ok ? res.text() : ""));
  if (served.trim() !== keyInfo.key) {
    throw new Error(`${keyUrl} does not serve the key yet; deploy first`);
  }

  const sitemap = await fetch(new URL("/sitemap.xml", origin)).then((res) => res.text());
  const urls = selectUrls(sitemapUrls(sitemap), origin, only);
  if (urls.length === 0) throw new Error("No sitemap URLs matched");
  const payload = buildPayload(urls, origin, keyInfo);

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  // 200 = accepted, 202 = accepted while the key is being checked.
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow answered ${res.status}: ${await res.text()}`);
  }
  console.log(`IndexNow accepted ${urls.length} URLs (HTTP ${res.status}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
