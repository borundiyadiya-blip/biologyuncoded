#!/usr/bin/env node
/**
 * Download the webfonts this site uses from Google Fonts and write them into
 * src/fonts/, plus a src/css/fonts.css with matching @font-face rules.
 *
 *   npm run fonts
 *
 * Why self-host at all: the Google Fonts <link> puts a third-party origin in
 * the render-blocking path (an extra DNS + TLS + round trip before the CSSOM
 * is complete) and sends every visitor's IP to Google. Serving the same files
 * from the same origin as the HTML removes both.
 *
 * We ask Google for the CSS with a modern Chrome user-agent so it hands back
 * woff2, then keep only the "latin" subset of each face — the blog is in
 * English, and the Cyrillic/Greek/Vietnamese subsets would otherwise be listed
 * in the CSS and fetched for any character that happened to fall in range.
 *
 * The generated fonts.css uses url("../fonts/…"), which resolves relative to
 * the stylesheet, so it is immune to pathPrefix changing between a project
 * site, a user site and a custom domain.
 *
 * IBM Plex Mono and Source Serif 4 are both SIL Open Font License 1.1, which
 * permits redistribution like this. See src/fonts/OFL.txt.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const FONT_DIR = "src/fonts";
const CSS_OUT = "src/css/fonts.css";

// A real Chrome UA, or Google replies with truetype instead of woff2.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Only the families the theme actually renders with. IBM Plex Sans was dropped
// deliberately — it was used for a handful of secondary bits (figcaption,
// footnotes, the wordmark tagline) that the system sans stack covers for free,
// and it cost a whole extra request.
const FAMILIES = [
  "IBM+Plex+Mono:wght@400;500;600",
  // Static instances of the variable face. The site never varies optical size,
  // so shipping the full opsz 8..60 axis would be paying for an axis nobody uses.
  "Source+Serif+4:opsz,wght@8..60,400;8..60,600",
];

const url =
  "https://fonts.googleapis.com/css2?" +
  FAMILIES.map((f) => `family=${f}`).join("&") +
  "&display=swap";

console.log("Fetching font CSS from Google…");
const res = await fetch(url, { headers: { "user-agent": UA } });
if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
const css = await res.text();

// Each @font-face block Google returns is one family + weight + unicode subset.
const blocks = css.match(/\/\*[^*]*\*\/\s*@font-face\s*\{[^}]*\}/g) || [];
if (!blocks.length) throw new Error("No @font-face blocks found in the response");

await fs.mkdir(FONT_DIR, { recursive: true });

// Collected first, written second: Google serves ONE variable file for several
// weights of the same family, so the same bytes arrive under two weights. We
// hash the payload, keep a single copy, and emit one @font-face carrying the
// whole weight range instead of two identical 120 KB downloads.
const faces = [];
let total = 0;

for (const block of blocks) {
  total++;

  // The comment before each block names the subset: /* latin */, /* greek */ …
  const subset = block.match(/\/\*\s*([a-z0-9-]+)\s*\*\//i)?.[1];
  if (subset !== "latin") continue;

  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
  const style = block.match(/font-style:\s*(\w+)/)?.[1] || "normal";
  const src = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
  const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();

  if (!family || !weight || !src) continue;

  const bin = await fetch(src, { headers: { "user-agent": UA } });
  if (!bin.ok) throw new Error(`HTTP ${bin.status} fetching ${src}`);
  const bytes = Buffer.from(await bin.arrayBuffer());

  faces.push({
    family,
    weight: Number(weight),
    style,
    range,
    bytes,
    hash: crypto.createHash("sha1").update(bytes).digest("hex"),
  });
}

// Group by identical payload: one file, one rule, one weight range.
const byHash = new Map();
for (const f of faces) {
  const g = byHash.get(f.hash);
  if (g) g.weights.push(f.weight);
  else byHash.set(f.hash, { ...f, weights: [f.weight] });
}

const rules = [];
let kept = 0;

for (const g of byHash.values()) {
  const lo = Math.min(...g.weights);
  const hi = Math.max(...g.weights);
  const slugBase = g.family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const file =
    `${slugBase}-${lo === hi ? lo : `${lo}-${hi}var`}` +
    (g.style !== "normal" ? `-${g.style}` : "") +
    ".woff2";

  await fs.writeFile(path.join(FONT_DIR, file), g.bytes);
  console.log(
    `  ${file.padEnd(30)} ${(g.bytes.length / 1024).toFixed(1).padStart(6)} KB` +
      (lo === hi ? "" : `  (variable, covers ${g.weights.sort().join("/")})`)
  );
  kept++;

  rules.push(
    [
      "@font-face {",
      `  font-family: "${g.family}";`,
      `  font-style: ${g.style};`,
      // A range makes the browser use this one variable file for every weight
      // in it, instead of synthesising or refusing to match.
      `  font-weight: ${lo === hi ? lo : `${lo} ${hi}`};`,
      // swap: show fallback text immediately rather than blank text, and accept
      // the reflow. The alternative (block) hides the article for up to 3s.
      "  font-display: swap;",
      `  src: url("../fonts/${file}") format("woff2");`,
      g.range ? `  unicode-range: ${g.range};` : null,
      "}",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

const header = `/* ============================================================================
   Generated by tools/fetch-fonts.mjs — do not edit by hand.
   Run \`npm run fonts\` to refresh.

   Latin subset only, woff2 only. Both families are SIL OFL 1.1 licensed;
   see src/fonts/OFL.txt.
   ========================================================================= */
`;

await fs.writeFile(CSS_OUT, header + "\n" + rules.join("\n\n") + "\n", "utf8");

console.log(`\nKept ${kept} of ${total} @font-face blocks (latin subset only)`);
console.log(`Wrote ${CSS_OUT}`);
