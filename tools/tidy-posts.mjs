#!/usr/bin/env node
/**
 * One-off tidy-up for the WordPress import.
 *
 *   node tools/tidy-posts.mjs          # show what would change
 *   node tools/tidy-posts.mjs --write  # actually rewrite the files
 *
 * Two jobs:
 *
 * 1. Descriptions. WordPress's REST API returns excerpts already truncated at
 *    ~55 words with a trailing "[…]", so every imported post had a description
 *    that stopped mid-sentence — and that text is what shows on the homepage,
 *    the archive, and in Google results. Rebuild it from the post's own first
 *    paragraphs, cut on a sentence boundary.
 *
 * 2. Tags. The WordPress tagging was 163 distinct tags over 84 posts, 120 of
 *    them used exactly once, plus the author's own name on 43 posts. That
 *    produced 166 topic pages, most with a single post — useless as
 *    navigation. Collapse to a small set of real topics.
 */

import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const DIR = "src/posts";

// ---------------------------------------------------------------- tag mapping
// null = drop the tag entirely (author name, institution names, words so broad
// they say nothing: "biology", "science", "health").
const TAG_MAP = {
  "Diya Borundiya": null, "2024": null, "animal communication": null,
  "biology": null, "chemistry": null, "communication": null, "decode": null,
  "diseases": null, "engineering": null, "future": null, "health": null,
  "idiopathic pulmonary fibrosis": null, "inequality": null, "IPF": null,
  "lab": null, "life": null, "Lipid": null, "mentality": null, "medicine": null,
  "nature": null, "PF Connectome": null, "science": null, "TLC": null,
  "yale": null, "yale medicine": null,

  "crispr": "Gene editing", "crispr cas9": "Gene editing", "cas9": "Gene editing",
  "gene editing": "Gene editing", "base editing": "Gene editing",
  "prime editing": "Gene editing", "crRNA": "Gene editing",
  "tracrRNA": "Gene editing", "casgevy": "Gene editing", "NHEJ": "Gene editing",
  "HDR": "Gene editing", "gene therapy": "Gene editing",
  "genetically modified": "Gene editing", "sickle cell disease": "Gene editing",

  "cancer": "Cancer", "cancer cure": "Cancer", "cancer treatment": "Cancer",
  "cancer screening": "Cancer", "cancer vaccines": "Cancer",
  "therapeutic cancer vaccines": "Cancer", "kidney cancer": "Cancer",
  "Tumor": "Cancer", "oncogenic": "Cancer", "oncogenic mutations": "Cancer",
  "Oncolytic": "Cancer", "early detection": "Cancer",

  "dna": "Genetics", "genes": "Genetics", "genetics": "Genetics",
  "genome": "Genetics", "genome sequencing": "Genetics",
  "genetic makeup": "Genetics", "non-coding DNA": "Genetics",
  "mutations": "Genetics", "transcription": "Genetics",
  "translation": "Genetics", "RNA": "Genetics", "quantum": "Genetics",
  "quantum-biology": "Genetics", "physics": "Genetics",

  "ai": "AI", "artificial-intelligence": "AI", "algorithms": "AI",
  "alphafold": "AI", "alphagenome": "AI", "deepmind": "AI",
  "protein folding": "AI", "technology": "AI", "Nobel prize": "AI",

  "brain": "Neuroscience", "neuroscience": "Neuroscience",
  "neuroplasticity": "Neuroscience", "neurotechnology": "Neuroscience",
  "brain implants": "Neuroscience", "brain disease": "Neuroscience",
  "consciousness": "Neuroscience", "memories": "Neuroscience",
  "emotion": "Neuroscience", "focus": "Neuroscience",
  "flow state": "Neuroscience", "addiction": "Neuroscience",
  "paralysis": "Neuroscience", "philosophy": "Neuroscience",

  "mental-health": "Mental health", "depression": "Mental health",
  "psychology": "Mental health",

  "immune system": "Immunology", "immunology": "Immunology",
  "immunotherapy": "Immunology", "antigens": "Immunology",
  "vaccine": "Immunology", "vaccines": "Immunology", "mRNA": "Immunology",

  "cells": "Cells and tissue", "stem cells": "Cells and tissue",
  "HeLa": "Cells and tissue", "immortal": "Cells and tissue",
  "organ": "Cells and tissue", "organ transplants": "Cells and tissue",
  "organ shortage": "Cells and tissue", "new kidney": "Cells and tissue",
  "transplants": "Cells and tissue",

  "synthetic biology": "Synthetic biology", "life forms": "Synthetic biology",
  "bioengineering": "Synthetic biology",

  "aging": "Aging", "age reversal": "Aging", "biological age": "Aging",
  "longevity": "Aging",

  "nutrition": "Nutrition", "diet": "Nutrition", "food": "Nutrition",
  "vegan": "Nutrition", "fake meat": "Nutrition", "probiotics": "Nutrition",
  "gut-health": "Nutrition", "cholestrol": "Nutrition",

  "vision": "Vision", "vision correcting": "Vision",
  "vision correcting displays": "Vision", "light field displays": "Vision",
  "lens free screens": "Vision", "glasses": "Vision", "contacts": "Vision",
  "blindness": "Vision", "blindness cure": "Vision",
  "inherited blindness": "Vision", "restoring vision": "Vision",
  "vision loss": "Vision",

  "liquid biopsies": "Diagnostics", "blood": "Diagnostics",
  "blood test": "Diagnostics", "blood tests": "Diagnostics",
  "biomarker testing": "Diagnostics",

  "alzheimer": "Alzheimer's", "alzheimer's": "Alzheimer's",
  "alzheimer's diagnosis": "Alzheimer's", "dementia": "Alzheimer's",

  "Virus": "Virology", "Bacteria": "Virology", "Lysogenic": "Virology",
  "Lytic": "Virology",

  "digital twin": "Digital twins", "digital twins": "Digital twins",
  "digital human twin": "Digital twins", "digital human twins": "Digital twins",
  "human twin": "Digital twins",

  "wellness": "Wellness", "lifestyle": "Wellness", "productivity": "Wellness",

  "precision medicine": "Precision medicine",
  "precision healthcare": "Precision medicine",
  "personalised healthcare": "Precision medicine",
  "personalised therapy": "Precision medicine",
  "healthcare": "Precision medicine",

  "Delivery systems": "Drug delivery", "Nanobots": "Drug delivery",
  "Nanoparticles": "Drug delivery",
};

// ---------------------------------------------------------------- description
const yamlQuote = (s) =>
  `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Strip markdown/HTML down to readable prose. */
function toProse(body) {
  return body
    .replace(/^---[\s\S]*?\n---\n/, "")           // front matter, if passed whole
    .replace(/```[\s\S]*?```/g, " ")              // code fences
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")  // tables and images
    .replace(/<[^>]+>/g, " ")                     // any other html
    .replace(/^#{1,6}\s+.*$/gm, " ")              // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")        // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")      // links -> their text
    .replace(/[*_`>]/g, "")                       // emphasis marks
    .replace(/\\([.\-#])/g, "$1")                 // turndown's escapes
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A description that ends on a sentence, not mid-word. */
function makeDescription(body, max = 185) {
  const prose = toProse(body);
  if (!prose) return "";
  if (prose.length <= max) return prose;

  // Prefer to end at the last sentence break inside the budget.
  const window = prose.slice(0, max + 40);
  const lastStop = Math.max(
    window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! ")
  );
  if (lastStop > max * 0.55) return window.slice(0, lastStop + 1).trim();

  // Otherwise cut on a word boundary and ellipsise.
  const cut = prose.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—-]$/, "").trim() + "…";
}

// ---------------------------------------------------------------- main
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md"));
let descFixed = 0, tagsChanged = 0, tagsBefore = new Set(), tagsAfter = new Set();

for (const file of files) {
  const full = path.join(DIR, file);
  const raw = fs.readFileSync(full, "utf8");

  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) { console.warn(`  no front matter: ${file}`); continue; }
  let [, fm, body] = m;

  // ---- tags
  const tagLines = fm.match(/^tags:\n((?:\s+-\s+.*\n?)+)/m);
  let newTagBlock = null;
  if (tagLines) {
    const current = tagLines[1]
      .split("\n")
      .map((l) => l.replace(/^\s*-\s+/, "").trim())
      .filter(Boolean)
      .map((t) => t.replace(/^"(.*)"$/, "$1"));

    current.forEach((t) => tagsBefore.add(t));

    const mapped = [...new Set(
      current.map((t) => (t in TAG_MAP ? TAG_MAP[t] : t)).filter(Boolean)
    )].sort();

    mapped.forEach((t) => tagsAfter.add(t));

    if (mapped.join("|") !== current.join("|")) tagsChanged++;
    newTagBlock = mapped.length
      ? "tags:\n" + mapped.map((t) => `  - ${yamlQuote(t)}`).join("\n") + "\n"
      : "";
  }
  if (newTagBlock !== null) {
    fm = fm.replace(/^tags:\n(?:\s+-\s+.*\n?)+/m, newTagBlock).replace(/\n{2,}/g, "\n");
  }

  // ---- description
  const descMatch = fm.match(/^description:\s*"((?:[^"\\]|\\.)*)"/m);
  const currentDesc = descMatch ? descMatch[1] : "";
  const truncated =
    !currentDesc ||
    /\[…\]|\[\.\.\.\]|…\s*$/.test(currentDesc) ||
    currentDesc.length < 40;

  if (truncated) {
    const next = makeDescription(body);
    if (next && next !== currentDesc) {
      fm = fm.replace(/^description:\s*"(?:[^"\\]|\\.)*"/m, `description: ${yamlQuote(next)}`);
      descFixed++;
    }
  }

  const out = `---\n${fm.replace(/\n+$/, "")}\n---\n${body}`;
  if (WRITE && out !== raw) fs.writeFileSync(full, out, "utf8");
}

console.log(`${files.length} posts scanned`);
console.log(`  descriptions rewritten  ${descFixed}`);
console.log(`  posts with tags changed ${tagsChanged}`);
console.log(`  distinct tags ${tagsBefore.size} -> ${tagsAfter.size}`);
console.log(`\n  ${[...tagsAfter].sort().join(", ")}`);
console.log(WRITE ? "\nFiles written." : "\nDry run — pass --write to apply.");
