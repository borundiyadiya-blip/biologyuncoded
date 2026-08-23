#!/usr/bin/env node
/**
 * Find candidate topics for the next post.
 *
 *   npm run research              # print ranked candidates
 *   npm run research -- --json    # machine-readable, for the workflow
 *
 * Source discovery is deliberately deterministic and free: Europe PMC for
 * peer-reviewed papers and preprints, plus a few news feeds. No model is
 * involved at this stage, so choosing what to write about is cheap, auditable,
 * and reproducible — and the model that writes the post is handed a real
 * citation rather than asked to remember what happened this week.
 *
 * Anything already covered is filtered out using data/covered.json, which the
 * writer appends to. That ledger is what stops the site slowly filling up with
 * six versions of the same CRISPR story.
 */

import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const LEDGER = "data/covered.json";
const POSTS = "src/posts";
const WANT_JSON = process.argv.includes("--json");
const DAYS = Number(process.env.RESEARCH_DAYS || 14);

const log = (...a) => { if (!WANT_JSON) console.log(...a); };

// The subject areas this blog actually covers. Used to build the Europe PMC
// query and to score news headlines.
const TOPICS = [
  "CRISPR", "gene editing", "base editing", "prime editing", "gene therapy",
  "mRNA vaccine", "cancer immunotherapy", "CAR-T", "single-cell RNA sequencing",
  "transcriptomics", "proteomics", "synthetic biology", "organoid",
  "protein structure prediction", "antibody engineering", "biomarker",
  "liquid biopsy", "neurodegeneration", "microbiome", "stem cell",
];

// ---------------------------------------------------------------- ledger
function loadLedger() {
  if (!fs.existsSync(LEDGER)) return { covered: [] };
  try {
    return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch {
    console.warn(`${LEDGER} is not valid JSON — treating as empty`);
    return { covered: [] };
  }
}

/** Title words already used across the archive, for near-duplicate detection. */
function existingTitles() {
  if (!fs.existsSync(POSTS)) return [];
  return fs
    .readdirSync(POSTS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const src = fs.readFileSync(path.join(POSTS, f), "utf8");
      return (src.match(/^title:\s*"(.*)"/m)?.[1] || "").toLowerCase();
    })
    .filter(Boolean);
}

const STOP = new Set([
  "the","a","an","of","and","or","in","on","for","to","with","how","why","what",
  "is","are","that","this","from","by","at","it","its","as","new","using","can",
]);

const keywords = (s) =>
  new Set(
    String(s).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );

/** Jaccard overlap — cheap and good enough to catch "we already wrote this". */
function similarity(a, b) {
  const A = keywords(a), B = keywords(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / new Set([...A, ...B]).size;
}

// ---------------------------------------------------------------- sources
const iso = (d) => d.toISOString().slice(0, 10);

async function fromEuropePmc() {
  const since = new Date(Date.now() - DAYS * 864e5);
  // Europe PMC's query language: topic OR topic, restricted to the window, with
  // an abstract present so the writer has something to work from.
  const terms = TOPICS.map((t) => `"${t}"`).join(" OR ");
  const query =
    `(${terms}) AND (FIRST_PDATE:[${iso(since)} TO ${iso(new Date())}]) ` +
    `AND (HAS_ABSTRACT:y)`;

  const url =
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
    `?query=${encodeURIComponent(query)}` +
    "&format=json&pageSize=100&sort=" + encodeURIComponent("P_PDATE_D desc");

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Europe PMC HTTP ${res.status}`);
  const data = await res.json();

  return (data?.resultList?.result || []).map((r) => ({
    source: "europepmc",
    title: r.title?.replace(/\.$/, "") || "",
    abstract: r.abstractText || "",
    journal: r.journalTitle || r.bookOrReportDetails?.publisher || "",
    date: r.firstPublicationDate || "",
    doi: r.doi || "",
    url: r.doi
      ? `https://doi.org/${r.doi}`
      : `https://europepmc.org/article/${r.source}/${r.id}`,
    citedBy: Number(r.citedByCount || 0),
    isPreprint: r.source === "PPR",
  }));
}

const FEEDS = [
  ["Nature Biotechnology", "https://www.nature.com/nbt.rss"],
  ["Science Daily — Biotech", "https://www.sciencedaily.com/rss/plants_animals/biotechnology.xml"],
  ["NIH Research Matters", "https://www.nih.gov/news-events/nih-research-matters/feed"],
];

async function fromFeeds() {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const cutoff = Date.now() - DAYS * 864e5;
  const out = [];

  for (const [name, url] of FEEDS) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "biologyuncoded-research (+static site)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = parser.parse(await res.text());

      const items = feed?.rss?.channel?.item || feed?.feed?.entry || [];
      for (const it of [].concat(items)) {
        const title = String(it.title?.["#text"] ?? it.title ?? "").trim();
        const link = String(it.link?.["@_href"] ?? it.link ?? "").trim();
        const when = new Date(it.pubDate || it.published || it.updated || 0);
        if (!title || !link) continue;
        if (when.getTime() && when.getTime() < cutoff) continue;

        out.push({
          source: name,
          title,
          abstract: String(it.description ?? it.summary?.["#text"] ?? it.summary ?? "")
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          journal: name,
          date: when.getTime() ? iso(when) : "",
          doi: "",
          url: link,
          citedBy: 0,
          isPreprint: false,
        });
      }
    } catch (err) {
      // One dead feed must not sink the run.
      console.warn(`  feed failed (${name}): ${err.message}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- scoring
function score(item) {
  let s = 0;

  // On-topic for this blog at all.
  const hay = `${item.title} ${item.abstract}`.toLowerCase();
  const hits = TOPICS.filter((t) => hay.includes(t.toLowerCase())).length;
  if (!hits) return 0;
  s += Math.min(hits, 3) * 10;

  // Recency, decaying over the window.
  if (item.date) {
    const age = (Date.now() - new Date(item.date).getTime()) / 864e5;
    s += Math.max(0, 20 - age);
  }

  // Enough abstract to actually write from.
  if (item.abstract.length > 600) s += 12;
  else if (item.abstract.length > 250) s += 6;
  else s -= 8;

  // Peer-reviewed beats preprint for a general-audience explainer.
  if (item.isPreprint) s -= 6;
  s += Math.min(item.citedBy, 10);

  return s;
}

// ---------------------------------------------------------------- main
const ledger = loadLedger();
const seenUrls = new Set(ledger.covered.map((c) => c.url));
const seenDois = new Set(ledger.covered.map((c) => c.doi).filter(Boolean));
const titles = [...existingTitles(), ...ledger.covered.map((c) => c.title)];

log(`Searching the last ${DAYS} days…`);

const settled = await Promise.allSettled([fromEuropePmc(), fromFeeds()]);
const raw = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
for (const r of settled) {
  if (r.status === "rejected") console.warn(`  source failed: ${r.reason?.message}`);
}

log(`  ${raw.length} items retrieved`);

const candidates = raw
  .filter((it) => it.title && !seenUrls.has(it.url) && !(it.doi && seenDois.has(it.doi)))
  .filter((it) => !titles.some((t) => similarity(t, it.title) > 0.42))
  .map((it) => ({ ...it, score: score(it) }))
  .filter((it) => it.score > 0)
  .sort((a, b) => b.score - a.score);

// Keep one item per close-title cluster so the shortlist isn't five angles on
// the same paper.
const shortlist = [];
for (const c of candidates) {
  if (shortlist.some((s) => similarity(s.title, c.title) > 0.42)) continue;
  shortlist.push(c);
  if (shortlist.length >= 12) break;
}

if (WANT_JSON) {
  process.stdout.write(JSON.stringify(shortlist, null, 2));
} else {
  log(`  ${candidates.length} new, ${shortlist.length} after clustering\n`);
  shortlist.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${c.score.toFixed(0)}] ${c.title.slice(0, 88)}`);
    console.log(`    ${c.source}${c.date ? " · " + c.date : ""} · ${c.url}`);
  });
  if (!shortlist.length) {
    console.log("Nothing new found. Widen the window with RESEARCH_DAYS=30.");
  }
}
