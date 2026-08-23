#!/usr/bin/env node
/**
 * Realign every post's published URL with the one it had on WordPress.
 *
 *   node tools/fix-urls.mjs          # dry run
 *   node tools/fix-urls.mjs --write
 *
 * Posts publish at /YYYY/MM/DD/slug/, so both halves have to match or an
 * already-shared link 404s. Two things had drifted after the import:
 *
 *   slug — the importer capped slugs at 80 characters and cut 16 mid-word.
 *   date — the importer took date_gmt, but WordPress builds the URL from the
 *          site's local date, which put 20 posts a day ahead.
 *
 * Every post records where it used to live in `wordpressUrl`, so that is the
 * authority for both. The front matter `date:` is rewritten too, not just the
 * filename, because the permalink is computed from the front matter.
 */

import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const DIR = "src/posts";

let slugFixed = 0;
let dateFixed = 0;

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  const full = path.join(DIR, file);
  let src = fs.readFileSync(full, "utf8");

  const wpUrl = src.match(/^wordpressUrl:\s*"([^"]+)"/m)?.[1];
  if (!wpUrl) continue;

  const m = wpUrl.replace(/\/+$/, "").match(/\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)$/);
  if (!m) continue;

  const [, y, mo, d, wpSlug] = m;
  const wpDate = `${y}-${mo}-${d}`;

  const ourDate = file.slice(0, 10);
  const ourSlug = file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");

  if (ourDate === wpDate && ourSlug === wpSlug) continue;

  if (ourSlug !== wpSlug) slugFixed++;
  if (ourDate !== wpDate) {
    dateFixed++;
    // The permalink comes from front matter, so the filename alone is not enough.
    src = src.replace(/^date:\s*.*$/m, `date: ${wpDate}`);
  }

  const target = path.join(DIR, `${wpDate}-${wpSlug}.md`);
  if (target !== full && fs.existsSync(target)) {
    console.warn(`  collision, skipping: ${path.basename(target)}`);
    continue;
  }

  console.log(`  ${ourDate}-${ourSlug}\n    -> ${wpDate}-${wpSlug}`);

  if (WRITE) {
    fs.writeFileSync(full, src, "utf8");
    if (target !== full) fs.renameSync(full, target);
  }
}

console.log(`\nslugs realigned: ${slugFixed}   dates realigned: ${dateFixed}`);
if (!WRITE) console.log("Dry run — pass --write to apply.");
