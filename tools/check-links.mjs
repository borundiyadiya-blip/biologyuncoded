#!/usr/bin/env node
/**
 * Verify every internal link in the built site points at a file that exists.
 *
 *   npm run check
 *
 * Run after a build. Exits non-zero if anything is broken, so it works in CI.
 *
 * This exists because a plugin once registered Eleventy's HtmlBasePlugin twice
 * and silently prefixed every href three times — the build succeeded, the
 * deploy succeeded, and every link on the live site 404'd. A green build is
 * not evidence that the site works.
 */

import fs from "node:fs";
import path from "node:path";

const OUT = "_site";
const PREFIX = (process.env.PATH_PREFIX || "/").replace(/\/+$/, "");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

if (!fs.existsSync(OUT)) {
  console.error(`No ${OUT}/ — run the build first.`);
  process.exit(1);
}

const files = walk(OUT);
const asUrl = (f) => f.split(path.sep).join("/").replace(/^_site/, "");
const present = new Set(files.map(asUrl));

const pages = files.filter((f) => f.endsWith(".html"));
const broken = [];
let checked = 0;

for (const file of pages) {
  const html = fs.readFileSync(file, "utf8");
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const url = m[1];
    checked++;

    if (PREFIX && url !== PREFIX && !url.startsWith(PREFIX + "/")) {
      broken.push([asUrl(file), url, "missing path prefix"]);
      continue;
    }

    const rel = (PREFIX ? url.slice(PREFIX.length) : url) || "/";
    const candidates = [rel, rel.replace(/\/$/, "") + "/index.html"];
    if (!candidates.some((c) => present.has(c))) {
      broken.push([asUrl(file), url, "no such file"]);
    }
  }
}

console.log(`${pages.length} pages, ${checked} internal links checked`);

if (!broken.length) {
  console.log("All internal links resolve.");
  process.exit(0);
}

console.error(`\n${broken.length} broken:`);
for (const [page, url, why] of broken.slice(0, 25)) {
  console.error(`  ${why.padEnd(20)} ${url}\n    on ${page}`);
}
if (broken.length > 25) console.error(`  …and ${broken.length - 25} more`);
process.exit(1);
