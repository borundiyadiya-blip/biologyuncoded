#!/usr/bin/env node
/**
 * Pull published posts straight off a public WordPress.com site's REST API and
 * write them out as Markdown. No export file, no login — everything this reads
 * is what an anonymous visitor can already see.
 *
 *   node tools/import-wpcom.mjs biologyuncoded.wordpress.com
 *   node tools/import-wpcom.mjs biologyuncoded.wordpress.com --pages
 *
 * Flags
 *   --pages        also import standalone pages, into src/pages/
 *   --no-images    leave image URLs pointing at wordpress.com
 *   --out DIR      post output directory (default src/posts)
 *   --force        overwrite files that already exist
 *
 * Re-running is safe: existing files are skipped unless --force is passed, so
 * hand-edits to already-imported posts survive a second run.
 *
 * This is the sibling of import-wordpress.mjs, which does the same job from a
 * WXR export file. Use that one if you need drafts or private posts — they
 * aren't exposed over the public API, by design.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const site = argv
  .find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out")
  ?.replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");

if (!site) {
  console.error("Usage: node tools/import-wpcom.mjs <site.wordpress.com> [flags]");
  process.exit(1);
}

const POSTS_DIR = value("out", "src/posts");
const PAGES_DIR = "src/pages";
const IMAGE_DIR = "src/images/posts";
const WANT_IMAGES = !flag("no-images");
const WANT_PAGES = flag("pages");
const FORCE = flag("force");

const API = `https://public-api.wordpress.com/wp/v2/sites/${site}`;

// ---------------------------------------------------------------- turndown
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});
td.use(gfm);

// Attributes worth keeping on an <img>. Everything else WordPress emits is
// either editor bookkeeping (data-attachment-id, data-image-meta, …) or points
// back at wordpress.com — srcset especially, which would still be resolving
// against a site that is about to stop existing.
const KEEP_IMG_ATTRS = new Set(["src", "alt", "width", "height", "title"]);

// Turndown parses with domino, whose NodeList and NamedNodeMap are array-like
// but not iterable — hence Array.from rather than spread or for..of.
function cleanImages(node) {
  const imgs = Array.from(node.querySelectorAll?.("img") || []);
  for (const img of imgs) {
    const names = Array.from(img.attributes).map((a) => a.name);
    for (const attr of names) {
      if (!KEEP_IMG_ATTRS.has(attr.toLowerCase())) img.removeAttribute(attr);
    }
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  }
  // WordPress's own layout classes mean nothing here; the theme styles figure.
  node.removeAttribute?.("class");
  return node;
}

// Keep figures as HTML so captions survive intact.
td.addRule("figure", {
  filter: ["figure"],
  replacement: (_content, node) => `\n\n${cleanImages(node).outerHTML.trim()}\n\n`,
});

// Gutenberg wraps embeds in divs that turn into noise otherwise.
td.addRule("stripEmptyDiv", {
  filter: (node) =>
    node.nodeName === "DIV" && !node.textContent.trim() && !node.querySelector("img"),
  replacement: () => "",
});

// The API hands back rendered HTML, so wordpress.com's own sharing/like/related
// widgets come with it. None of that means anything on a static site.
td.addRule("stripWpChrome", {
  filter: (node) =>
    node.nodeType === 1 &&
    /^(sharedaddy|sd-block|jp-relatedposts|sharing|wpcom|likes-widget|post-likes)/.test(
      node.getAttribute?.("class") || ""
    ),
  replacement: () => "",
});

// ---------------------------------------------------------------- helpers
/** Quote a string for YAML, escaping embedded quotes and backslashes. */
const yaml = (s) => `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const decode = (s) =>
  String(s ?? "")
    .replace(/&#8217;|&#039;|&#39;|&apos;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    // Ampersand last, so "&amp;lt;" doesn't decode twice into a real tag.
    .replace(/&amp;/g, "&");

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    // Only a sanity cap, and it cuts on a hyphen so a slug never ends
    // mid-word. These are the live URLs and they have to keep matching the
    // WordPress ones, or every link already shared out in the world breaks.
    .replace(/^(.{0,120})(-.*)?$/s, "$1")
    .replace(/^-|-$/g, "");

const pad = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- fetching
async function getJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "biologyuncoded-import (+static site migration)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { body: await res.json(), headers: res.headers };
}

/** Walk every page of a WP REST collection. */
async function fetchAll(kind) {
  const out = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `${API}/${kind}?per_page=100&page=${page}&_embed=1&status=publish&orderby=date&order=desc`;
    const { body, headers } = await getJson(url);
    if (!Array.isArray(body)) throw new Error(`Unexpected response for ${kind}`);
    out.push(...body);

    if (page === 1) {
      totalPages = Number(headers.get("x-wp-totalpages") || 1);
      const total = headers.get("x-wp-total");
      console.log(`  ${kind}: ${total} published, ${totalPages} page(s) to fetch`);
    }
    page++;
  } while (page <= totalPages);

  return out;
}

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
    let base;
    try {
      base = path.basename(new URL(clean).pathname) || "image";
    } catch {
      imageCache.set(url, null);
      continue;
    }
    if (!path.extname(base)) base += ".jpg";

    let target = path.join(IMAGE_DIR, base);
    let n = 2;
    while (existsSync(target)) {
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

// ---------------------------------------------------------------- conversion
const usedSlugs = new Set();
const stats = { posts: 0, pages: 0, existing: 0 };

async function writeItem(item, kind) {
  const title = decode(item.title?.rendered || "").trim() || "Untitled";

  // item.date is the site's local publish time, which is what WordPress uses
  // to build /YYYY/MM/DD/ in the permalink. Using date_gmt instead puts posts
  // published in the evening a day ahead, and the date is part of the URL.
  const date = new Date(`${item.date || item.date_gmt}Z`.replace(/Z+$/, "Z"));
  if (isNaN(date)) {
    console.warn(`    no usable date for "${title.slice(0, 40)}" — skipping`);
    return;
  }

  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());

  const slug = slugify(item.slug || slugify(title));
  let unique = slug;
  let n = 2;
  while (usedSlugs.has(`${y}-${m}-${d}-${unique}`)) unique = `${slug}-${n++}`;
  usedSlugs.add(`${y}-${m}-${d}-${unique}`);

  const dir = kind === "pages" ? PAGES_DIR : POSTS_DIR;
  await fs.mkdir(dir, { recursive: true });
  const filename = kind === "pages" ? `${unique}.md` : `${y}-${m}-${d}-${unique}.md`;
  const outPath = path.join(dir, filename);

  if (existsSync(outPath) && !FORCE) {
    stats.existing++;
    return;
  }

  // ---- content
  let markdown = td
    .turndown(item.content?.rendered || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  markdown = await localiseImages(markdown);

  // ---- excerpt
  let excerpt = decode(item.excerpt?.rendered || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/Continue reading.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!excerpt) {
    const plain = markdown
      .replace(/<[^>]+>/g, " ")
      .replace(/[#*_>`[\]()!]/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    excerpt = plain.length > 200 ? plain.slice(0, plain.lastIndexOf(" ", 200)) + "…" : plain;
  }

  // ---- taxonomy: _embed returns categories and tags as parallel term arrays
  const terms = (item._embedded?.["wp:term"] || [])
    .flat()
    .map((t) => decode(t?.name || "").trim())
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
  fm.push(`wordpressUrl: ${yaml(item.link || "")}`);
  fm.push("---", "");

  await fs.writeFile(outPath, fm.join("\n") + "\n" + markdown + "\n", "utf8");

  if (kind === "pages") stats.pages++;
  else stats.posts++;

  console.log(`  ${y}-${m}-${d}  ${title.slice(0, 62)}`);
}

// ---------------------------------------------------------------- main
console.log(`Reading ${site} over the public REST API\n`);

await fs.mkdir(POSTS_DIR, { recursive: true });

const posts = await fetchAll("posts");
console.log("");
for (const item of posts) await writeItem(item, "posts");

if (WANT_PAGES) {
  console.log("");
  const pages = await fetchAll("pages");
  console.log("");
  for (const item of pages) await writeItem(item, "pages");
}

console.log("\n" + "-".repeat(56));
console.log(`  posts written      ${stats.posts}`);
if (WANT_PAGES) console.log(`  pages written      ${stats.pages}`);
if (stats.existing) console.log(`  already present    ${stats.existing}  (use --force to overwrite)`);
if (WANT_IMAGES) console.log(`  images downloaded  ${imageOk}${imageFail ? `, ${imageFail} failed` : ""}`);
console.log("-".repeat(56));
