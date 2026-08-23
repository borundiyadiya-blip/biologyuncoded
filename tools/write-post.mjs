#!/usr/bin/env node
/**
 * Research one candidate topic and write a post about it.
 *
 *   npm run write                  # take the top candidate
 *   npm run write -- --index 3     # take the 3rd
 *   npm run write -- --draft       # write it with draft: true
 *   npm run write -- --dry         # print, write nothing
 *
 * Three model calls, on purpose:
 *
 *   1. RESEARCH  — web search, gathers what is actually known and where it was
 *                  reported. This is the only call with tools.
 *   2. WRITE     — no tools, structured output. Works only from the brief, so
 *                  it cannot quietly invent a source it never saw.
 *   3. VERIFY    — no tools, structured output. Re-reads the draft against the
 *                  brief and flags anything unsupported.
 *
 * If verification fails, the post is written with `draft: true` and never
 * publishes. That is the brake: an unreviewed pipeline that publishes
 * medical-adjacent claims to a real byline is not something to run without one.
 *
 * Needs ANTHROPIC_API_KEY in the environment.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const LEDGER = "data/covered.json";
const POSTS = "src/posts";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const DRY = flag("dry");
const FORCE_DRAFT = flag("draft");
const INDEX = Number(arg("index", 1)) - 1;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const client = new Anthropic();

// ---------------------------------------------------------------- candidate
console.log("Finding candidates…");
const candidates = JSON.parse(
  execFileSync(process.execPath, ["tools/research.mjs", "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
);

if (!candidates.length) {
  console.log("No new candidates. Nothing to write.");
  process.exit(0);
}

const pick = candidates[Math.max(0, Math.min(INDEX, candidates.length - 1))];
console.log(`\nWriting about:\n  ${pick.title}\n  ${pick.url}\n`);

// ---------------------------------------------------------------- 1. research
const VOICE = `
You are writing for Biology Uncoded, a blog by Diya Borundiya, a high school
researcher working on transcriptomics, RNA biology and CRISPR. The audience is
curious and scientifically literate but not specialists in this subfield.

House style:
- Explain the mechanism, not just the headline. The reader should finish
  understanding how the thing works, not only that it happened.
- Plain, direct sentences. No hype, no "game-changing", no "revolutionary".
- Be explicit about uncertainty. Mouse study, small cohort, preprint, phase I,
  in vitro only — say so, in the body, not as a disclaimer at the end.
- Never imply medical advice or that a treatment is available.
- British-neutral spelling is fine either way; be consistent within a post.
`.trim();

async function runWithServerTools(params) {
  // A web-search turn can stop with stop_reason "pause_turn" before it is
  // finished. Resuming means handing the paused assistant turn straight back.
  const messages = [...params.messages];
  let response;

  for (let turn = 0; turn < 8; turn++) {
    response = await client.messages.create({ ...params, messages });

    if (response.stop_reason === "refusal") {
      throw new Error(
        `Model declined: ${response.stop_details?.category ?? "unknown"}`
      );
    }
    if (response.stop_reason !== "pause_turn") return response;

    messages.push({ role: "assistant", content: response.content });
  }
  return response;
}

console.log("[1/3] Researching…");
const research = await runWithServerTools({
  model: MODEL,
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high" },
  system: VOICE,
  tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
  messages: [
    {
      role: "user",
      content: `Research this for a blog post. Search the web to confirm and expand on it.

TITLE: ${pick.title}
SOURCE: ${pick.url}
${pick.journal ? `PUBLISHED IN: ${pick.journal}` : ""}
${pick.date ? `DATE: ${pick.date}` : ""}

ABSTRACT / SUMMARY:
${pick.abstract.slice(0, 4000)}

Produce a research brief covering:
1. What was actually done and found — the mechanism, in detail.
2. What is genuinely new about it versus what came before.
3. The limitations. Study size, model organism, trial phase, what it does NOT show.
4. Why a non-specialist should care.
5. A numbered SOURCES list. Every source must be one you actually retrieved,
   with its real URL. Do not list anything you did not open.

If the search suggests this finding is overstated, misreported, or is a
press release without a paper behind it, say so plainly — that is a useful
result and I would rather not publish than publish something thin.`,
    },
  ],
});

const brief = research.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n")
  .trim();

if (brief.length < 400) {
  console.error("Research brief came back too thin — stopping.");
  process.exit(1);
}
console.log(`      brief: ${brief.length} chars`);

// ---------------------------------------------------------------- 2. write
const PostSchema = z.object({
  title: z.string().describe("Headline. Specific, no clickbait, under 80 chars."),
  description: z.string().describe("One or two sentences for the homepage and search results. A complete sentence, never truncated."),
  tags: z.array(z.string()).describe("2-4 topics, chosen from the allowed list."),
  body_markdown: z.string().describe("The post body in Markdown. Starts at ## — no H1, the layout supplies it. 700-1100 words."),
  sources: z.array(z.object({ label: z.string(), url: z.string() })).describe("Every source referenced, with real URLs from the brief."),
  confidence: z.enum(["high", "medium", "low"]).describe("How well supported the central claim is by the brief."),
});

// The consolidated topic set. Keeping the writer inside it stops the tag list
// sprawling back to the 163 tags the WordPress import arrived with.
const ALLOWED_TAGS = [
  "AI", "Aging", "Alzheimer's", "Cancer", "Cells and tissue", "Diagnostics",
  "Digital twins", "Drug delivery", "Gene editing", "Genetics", "Immunology",
  "Mental health", "Neuroscience", "Nutrition", "Precision medicine",
  "Synthetic biology", "Virology", "Vision", "Wellness",
];

console.log("[2/3] Writing…");
const written = await client.messages.parse({
  model: MODEL,
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high", format: zodOutputFormat(PostSchema) },
  system: VOICE,
  messages: [
    {
      role: "user",
      content: `Write the post from this brief. Work only from the brief — if a
detail is not in it, leave it out rather than filling the gap from memory.

Tags must come from this list exactly: ${ALLOWED_TAGS.join(", ")}

Structure the body with ## subheadings. Open with what happened and why it
matters — no throat-clearing. Include a short section on the limitations; it is
not an afterthought. Close with what would have to be true for this to reach
people, and what to watch next.

Set confidence honestly. "low" if the brief rests on a single preprint, a press
release, or a study too small to support the headline.

BRIEF:
${brief}`,
    },
  ],
});

const post = written.parsed_output;
if (!post) {
  console.error("Structured output failed to parse — stopping.");
  process.exit(1);
}
console.log(`      "${post.title}" (${post.body_markdown.split(/\s+/).length} words, confidence ${post.confidence})`);

// ---------------------------------------------------------------- 3. verify
const VerdictSchema = z.object({
  publishable: z.boolean().describe("True only if every substantive claim is supported by the brief."),
  unsupported_claims: z.array(z.string()).describe("Claims in the draft the brief does not support. Quote them."),
  overstatements: z.array(z.string()).describe("Places the draft is more certain than the evidence."),
  notes: z.string().describe("Anything else a human should know before this goes out."),
});

console.log("[3/3] Verifying…");
const check = await client.messages.parse({
  model: MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high", format: zodOutputFormat(VerdictSchema) },
  messages: [
    {
      role: "user",
      content: `You are fact-checking a draft against the research brief it was
written from. Be adversarial: your job is to catch anything the brief does not
actually support, not to approve it.

Fail it (publishable: false) if the draft:
- states as fact anything the brief only suggests,
- drops a limitation the brief raised,
- implies clinical availability or medical advice,
- cites a source that does not appear in the brief.

BRIEF:
${brief}

DRAFT:
# ${post.title}
${post.body_markdown}`,
    },
  ],
});

const verdict = check.parsed_output;
const ok = verdict?.publishable === true && post.confidence !== "low";

console.log(`      publishable: ${verdict?.publishable}  confidence: ${post.confidence}`);
for (const c of verdict?.unsupported_claims ?? []) console.log(`      ! unsupported: ${c.slice(0, 100)}`);
for (const o of verdict?.overstatements ?? []) console.log(`      ! overstated:  ${o.slice(0, 100)}`);

const isDraft = FORCE_DRAFT || !ok;

// ---------------------------------------------------------------- assemble
const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^(.{0,90})(-.*)?$/s, "$1").replace(/^-|-$/g, "");

const yaml = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const today = new Date();
const stamp = [
  today.getUTCFullYear(),
  String(today.getUTCMonth() + 1).padStart(2, "0"),
  String(today.getUTCDate()).padStart(2, "0"),
].join("-");

const tags = post.tags.filter((t) => ALLOWED_TAGS.includes(t));

const sourceBlock = post.sources.length
  ? "\n\n## Sources\n\n" +
    post.sources.map((s) => `- [${s.label}](${s.url})`).join("\n") + "\n"
  : "";

const frontMatter = [
  "---",
  `title: ${yaml(post.title)}`,
  `date: ${stamp}`,
  `description: ${yaml(post.description)}`,
  ...(tags.length ? ["tags:", ...tags.map((t) => `  - ${yaml(t)}`)] : []),
  ...(isDraft ? ["draft: true"] : []),
  // Provenance, so it is always answerable how a given post came to exist.
  `generated: true`,
  `generatedBy: ${yaml(MODEL)}`,
  `reviewVerdict: ${yaml(verdict?.publishable ? "passed" : "failed")}`,
  `sourceUrl: ${yaml(pick.url)}`,
  "---",
  "",
].join("\n");

const body = `${post.body_markdown.trim()}${sourceBlock}`;
const file = path.join(POSTS, `${stamp}-${slugify(post.title)}.md`);

if (DRY) {
  console.log("\n--- dry run, nothing written ---\n");
  console.log(frontMatter + body);
  process.exit(0);
}

fs.mkdirSync(POSTS, { recursive: true });
fs.writeFileSync(file, frontMatter + body + "\n", "utf8");

const ledger = fs.existsSync(LEDGER)
  ? JSON.parse(fs.readFileSync(LEDGER, "utf8"))
  : { covered: [] };
ledger.covered.push({
  title: pick.title,
  url: pick.url,
  doi: pick.doi || "",
  postedAs: post.title,
  file,
  date: stamp,
  draft: isDraft,
});
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n", "utf8");

console.log(`\nWrote ${file}${isDraft ? "  (draft: true — will NOT publish)" : ""}`);
if (isDraft) {
  console.log("Reason:", verdict?.notes || "confidence too low");
}
