import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPayload, readKey, selectUrls, sitemapUrls } from "../scripts/indexnow.mjs";

const origin = "https://speedxrental.com";

describe("IndexNow submission", () => {
  it("keeps a key file in public/ whose content is its key", () => {
    const { key, fileName } = readKey(join(process.cwd(), "public"));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(fileName).toBe(`indexnow-${key}.txt`);
  });

  it("submits this site's sitemap URLs, optionally narrowed to one section", () => {
    const xml = `<urlset>
      <url><loc>https://speedxrental.com/en</loc></url>
      <url><loc>https://speedxrental.com/en/auto-repair/tesla-ev</loc></url>
      <url><loc>https://speedxrental.com/zh-CN/auto-repair</loc></url>
      <url><loc>https://other.example/en/auto-repair</loc></url>
    </urlset>`;
    const urls = sitemapUrls(xml);

    expect(selectUrls(urls, origin)).toEqual([
      "https://speedxrental.com/en",
      "https://speedxrental.com/en/auto-repair/tesla-ev",
      "https://speedxrental.com/zh-CN/auto-repair",
    ]);
    expect(selectUrls(urls, origin, "auto-repair")).toEqual([
      "https://speedxrental.com/en/auto-repair/tesla-ev",
      "https://speedxrental.com/zh-CN/auto-repair",
    ]);
  });

  it("points keyLocation at the root key file", () => {
    const payload = buildPayload(["https://speedxrental.com/en"], origin, {
      key: "0123456789abcdef0123456789abcdef",
      fileName: "indexnow-0123456789abcdef0123456789abcdef.txt",
    });
    expect(payload).toEqual({
      host: "speedxrental.com",
      key: "0123456789abcdef0123456789abcdef",
      keyLocation: "https://speedxrental.com/indexnow-0123456789abcdef0123456789abcdef.txt",
      urlList: ["https://speedxrental.com/en"],
    });
  });
});
