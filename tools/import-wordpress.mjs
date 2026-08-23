#!/usr/bin/env node
/**
 * Convert a WordPress WXR export into Markdown posts for this site.
 *
 *   node tools/import-wordpress.mjs export.xml
 *   node tools/import-wordpress.mjs export.xml --drafts --no-images
 *
 * Flags
 *   --drafts       also import drafts and pending posts (as draft: true)
 *   --pages        also import pages, into src/pages/
 *   --no-images    leave image URLs pointing at wordpress.com
 *   --out DIR      post output directory (default src/posts)
 *   --force        overwrite files that already exist
 *
 * Re-running is safe: existing files are skipped unless --force is passed, so
 * hand-edits to already-imported posts survive a second run.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const inputFile = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--out");
if (!inputFile) {
  console.error("Usage: node tools/import-wordpress.mjs <export.xml> [flags]");
  process.exit(1);
}

const POSTS_DIR = value("out", "src/posts");
const PAGES_DIR = "src/pages";
const IMAGE_DIR = "src/images/posts";
const WANT_IMAGES = !flag("no-images");
const WANT_DRAFTS = flag("drafts");
const WANT_PAGES = flag("pages");
const FORCE = flag("force");

// ---------------------------------------------------------------- turndown
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});
td.use(gfm);

// Keep figures as HTML so captions survive intact.
td.addRule("figure", {
  filter: ["figure"],
  replacement: (_content, node) => `\n\n${node.outerHTML.trim()}\n\n`,
});

// WordPress wraps embeds in divs that turn into noise otherwise.
td.addRule("stripEmptyDiv", {
  filter: (node) =>
    node.nodeName === "DIV" && !node.textContent.trim() && !node.querySelector("img"),
  replacement: () => "",
});

// ---------------------------------------------------------------- helpers
const asArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** Quote a string for YAML, escaping embedded quotes and backslashes. */
const yaml = (s) => `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const decode = (s) =>
  String(s ?? "")
    .replace(/&#8217;|&#039;|&apos;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

/** Strip Gutenberg block comments — they carry no content, only editor state. */
const stripBlockComments = (html) => String(html ?? "").replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "");

/** WordPress classic editor uses bare newlines for paragraphs. */
const autoParagraph = (html) => {
  if (/<(p|div|figure|ul|ol|h[1-6]|blockquote|pre|table)[\s>]/i.test(html)) return html;
  return html
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${chunk.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
};

const pad = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- images
const imageCache = new Map();
let imageOk = 0;
let imageFail = 0;

async function localiseImages(markdown) {
  if (!WANT_IMAGES) return markdown;

  const urls = new Set();
  const patterns = [
    /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g,
    /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(markdown))) urls.add(m[1]);
  }

  for (const url of urls) {
    if (imageCache.has(url)) continue;

    // Drop WordPress's ?w= resizing so we archive the full-size original.
    const clean = url.split("?")[0];
    let base = path.basename(new URL(clean).pathname) || "image";
    if (!path.extname(base)) base += ".jpg";
    let target = path.join(IMAGE_DIR, base);
    let n = 2;
    while (existsSync(target) && !imageCache.has(url)) {
      const ext = path.extname(base);
      target = path.join(IMAGE_DIR, `${path.basename(base, ext)}-${n++}${ext}`);
    }

    try {
      const res = await fetch(clean, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fs.mkdir(IMAGE_DIR, { recursive: true });
      await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
      imageCache.set(url, "/" + path.relative("src", target).split(path.sep).join("/"));
      imageOk++;
    } catch (err) {
      console.warn(`    image failed (${err.message}), keeping remote URL: ${clean}`);
      imageCache.set(url, null);
      imageFail++;
    }
  }

  let out = markdown;
  for (const [remote, local] of imageCache) {
    if (local) out = out.split(remote).join(local);
  }
  return out;
}

// ---------------------------------------------------------------- main
const xml = await fs.readFile(inputFile, "utf8");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ["item", "category"].includes(name),
});

const doc = parser.parse(xml);
const channel = doc?.rss?.channel;
if (!channel) {
  console.error("That file doesn't look like a WordPress WXR export (no <channel> found).");
  process.exit(1);
}

const text = (node) => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node.__cdata != null) return String(node.__cdata);
  if (node["#text"] != null) return String(node["#text"]);
  return "";
};

const items = asArray(channel.item);
console.log(`Parsed ${items.length} items from ${path.basename(inputFile)}\n`);

await fs.mkdir(POSTS_DIR, { recursive: true });

const stats = { posts: 0, pages: 0, skipped: 0, drafts: 0, existing: 0 };
const usedSlugs = new Set();

for (const item of items) {
  const type = text(item["wp:post_type"]);
  const status = text(item["wp:status"]);

  if (type !== "post" && !(WANT_PAGES && type === "page")) continue;

  const isDraft = status !== "publish";
  if (isDraft && !WANT_DRAFTS) {
    stats.skipped++;
    continue;
  }

  const title = decode(text(item.title)).trim() || "Untitled";

  // Drafts often carry a zeroed post_date_gmt, so try each source in turn and
  // only fall back to "today" if the export genuinely has no usable date.
  const candidates = [
    text(item["wp:post_date_gmt"]),
    text(item["wp:post_date"]),
    text(item.pubDate),
  ];
  let date = null;
  for (const raw of candidates) {
    const s = String(raw).trim();
    if (!s || s.startsWith("0000")) continue;
    const parsed = new Date(/^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(" ", "T") + "Z" : s);
    if (!isNaN(parsed)) {
      date = parsed;
      break;
    }
  }
  if (!date) {
    date = new Date();
    console.warn(`    no usable date for "${title.slice(0, 40)}" — using today`);
  }

  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());

  let slug = decode(text(item["wp:post_name"])) || slugify(title);
  slug = slugify(slug);
  let unique = slug;
  let n = 2;
  while (usedSlugs.has(`${y}-${m}-${d}-${unique}`)) unique = `${slug}-${n++}`;
  usedSlugs.add(`${y}-${m}-${d}-${unique}`);

  const dir = type === "page" ? PAGES_DIR : POSTS_DIR;
  await fs.mkdir(dir, { recursive: true });
  const filename =
    type === "page" ? `${unique}.md` : `${y}-${m}-${d}-${unique}.md`;
  const outPath = path.join(dir, filename);

  if (existsSync(outPath) && !FORCE) {
    stats.existing++;
    continue;
  }

  // ---- content
  let html = text(item["content:encoded"]);
  html = stripBlockComments(html);
  html = autoParagraph(html);

  let markdown = td.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
  markdown = await localiseImages(markdown);

  // ---- excerpt
  let excerpt = decode(text(item["excerpt:encoded"])).replace(/<[^>]+>/g, " ");
  excerpt = excerpt.replace(/\s+/g, " ").trim();
  if (!excerpt) {
    const plain = markdown
      .replace(/<[^>]+>/g, " ")
      .replace(/[#*_>`[\]()!]/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    excerpt = plain.length > 200 ? plain.slice(0, plain.lastIndexOf(" ", 200)) + "…" : plain;
  }

  // ---- taxonomy: WordPress emits both categories and tags as <category>
  const terms = asArray(item.category)
    .map((c) => decode(text(c)).trim())
    .filter((t) => t && t.toLowerCase() !== "uncategorized");
  const tagSet = [...new Set(terms)];

  // ---- front matter
  const fm = [
    "---",
    `title: ${yaml(title)}`,
    `date: ${y}-${m}-${d}`,
    `description: ${yaml(excerpt)}`,
  ];
  if (tagSet.length) {
    fm.push("tags:");
    tagSet.forEach((t) => fm.push(`  - ${yaml(t)}`));
  }
  if (isDraft) fm.push("draft: true");
  fm.push(`wordpressUrl: ${yaml(decode(text(item.link)))}`);
  fm.push("---", "");

  await fs.writeFile(outPath, fm.join("\n") + "\n" + markdown + "\n", "utf8");

  if (type === "page") stats.pages++;
  else stats.posts++;
  if (isDraft) stats.drafts++;

  console.log(`  ${y}-${m}-${d}  ${title.slice(0, 62)}`);
}

console.log("\n" + "-".repeat(56));
console.log(`  posts written      ${stats.posts}${stats.drafts ? ` (${stats.drafts} draft)` : ""}`);
if (WANT_PAGES) console.log(`  pages written      ${stats.pages}`);
if (stats.existing) console.log(`  already present    ${stats.existing}  (use --force to overwrite)`);
if (!WANT_DRAFTS && stats.skipped) console.log(`  unpublished skipped ${stats.skipped}  (use --drafts to include)`);
if (WANT_IMAGES) console.log(`  images downloaded  ${imageOk}${imageFail ? `, ${imageFail} failed` : ""}`);
console.log("-".repeat(56));
console.log("\nNext: npm start — then check a few posts for stray HTML.\n");
