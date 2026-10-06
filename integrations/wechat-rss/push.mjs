// 把 zlzchat 的公众号 Atom 推进 WujieHOT。
// 生产环境禁止内网 RSS，所以由这台机器主动推，而不是让站点去拉。
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = readFileSync(path.join(root, ".env"), "utf8");
const token = /^INGEST_TOKEN=(.+)$/m.exec(env)?.[1]?.trim();
if (!token || token.length < 16) {
  console.error("INGEST_TOKEN missing");
  process.exit(1);
}

const zlzchat = process.env.ZLZCHAT_URL ?? "http://127.0.0.1:10082";
const ingest = process.env.WUJIEHOT_INGEST_URL ?? "http://127.0.0.1:3000/api/ingest/items";

const FEEDS = [
  ["ext-mp-jushen-zhixin", "具身智能之心", `${zlzchat}/feedAtom/30809a94d26f9b409a349dacbabde8fc`],
  ["ext-mp-jushen-jiyuan", "具身纪元", `${zlzchat}/feedAtom/b446219bfaf084cb76034097c74ad6de`],
  ["ext-mp-tiannan", "天南具身公园", `${zlzchat}/feedAtom/4d1cccec30b81e03f9e06f46d22281f9`],
];

function text(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`).exec(block);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim() : "";
}

function itemsOf(xml) {
  const items = [];
  for (const block of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const title = text(block, "title");
    const url = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(block)?.[1]
      ?? /<link[^>]*href="(https?:\/\/[^"]+)"/.exec(block)?.[1]
      ?? "";
    const publishedAt = text(block, "published") || text(block, "updated");
    const author = text(block, "name");
    if (!title || !url.startsWith("http")) continue;
    items.push({ title, url, publishedAt, author });
  }
  return items.slice(0, 8);
}

function articleText(html) {
  const start = html.indexOf('id="js_content"');
  if (start < 0) return "";
  const open = html.indexOf(">", start);
  const endAt = ["id=\"js_tags\"", "class=\"rich_media_tool\"", "id=\"js_pc_qr_code\""]
    .map((mark) => html.indexOf(mark, start))
    .filter((i) => i > start);
  const end = endAt.length ? Math.min(...endAt) : Math.min(html.length, open + 400_000);
  const text = html.slice(open + 1, end)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 20_000);
}

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function withBody(item) {
  if (!item.url.includes("mp.weixin.qq.com")) return item;
  try {
    const html = await fetch(item.url, {
      headers: { "user-agent": BROWSER, accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.text());
    const bodyText = articleText(html);
    if (bodyText.length >= 20) return { ...item, bodyText };
  } catch (err) {
    console.error(`body ${item.url} ${err.message}`);
  }
  return item;
}

for (const [sourceId, sourceName, feedUrl] of FEEDS) {
  const xml = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) }).then((r) => {
    if (!r.ok) throw new Error(`${feedUrl} HTTP ${r.status}`);
    return r.text();
  });
  const items = [];
  for (const item of itemsOf(xml)) items.push(await withBody(item));
  const res = await fetch(ingest, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ sourceId, sourceName, items }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.text();
  console.log(`${sourceName} ${res.status} items=${items.length} ${body.slice(0, 180)}`);
  if (!res.ok) process.exitCode = 1;
}
