#!/usr/bin/env node
/**
 * Build the weekly digest and hand it to Buttondown.
 *
 *   npm run newsletter              # build it, print it, send nothing
 *   npm run newsletter -- --draft   # create it in Buttondown as a draft
 *   npm run newsletter -- --send    # create and send it
 *
 * Sending is opt-in at the flag level so that running this by hand can never
 * mail your subscribers by accident; the scheduled workflow passes --send.
 *
 * If no posts went out this week it exits without sending. An empty "here's
 * what happened" email is worse than no email.
 *
 * Needs BUTTONDOWN_API_KEY to send. ANTHROPIC_API_KEY is optional — with it,
 * the digest gets a short written introduction tying the week together;
 * without it, the digest is still assembled and sent, just without the intro.
 */

import fs from "node:fs";
import path from "node:path";

const POSTS = "src/posts";
const DAYS = Number(process.env.NEWSLETTER_DAYS || 7);
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

const flag = (n) => process.argv.includes(`--${n}`);
const SEND = flag("send");
const DRAFT = flag("draft");

const SITE_URL = (process.env.SITE_URL || "https://borundiyadiya-blip.github.io/biologyuncoded")
  .replace(/\/+$/, "");

// ---------------------------------------------------------------- gather
function frontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const [, fm, body] = m;
  // Values are YAML double-quoted, so unescape them — otherwise a title like
  // Unlocking the "Junk DNA" Genome reaches the email as \"Junk DNA\".
  const get = (k) =>
    (fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m"))?.[1] || "")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  return {
    title: get("title"),
    date: get("date"),
    description: get("description"),
    draft: /^draft:\s*true/m.test(fm),
    generated: /^generated:\s*true/m.test(fm),
    body,
  };
}

/** Rebuild the published URL the same way posts.11tydata.js does. */
function urlFor(dateStr, file) {
  const [y, m, d] = dateStr.split("-");
  const slug = path.basename(file, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return `${SITE_URL}/${y}/${m}/${d}/${slug}/`;
}

const cutoff = Date.now() - DAYS * 864e5;

const week = fs
  .readdirSync(POSTS)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ file: f, ...(frontMatter(fs.readFileSync(path.join(POSTS, f), "utf8")) || {}) }))
  .filter((p) => p.title && p.date && !p.draft)
  .filter((p) => new Date(p.date + "T00:00:00Z").getTime() >= cutoff)
  .sort((a, b) => new Date(b.date) - new Date(a.date));

console.log(`${week.length} post(s) published in the last ${DAYS} days`);

if (!week.length) {
  console.log("Nothing to send. Exiting without contacting Buttondown.");
  process.exit(0);
}

// ---------------------------------------------------------------- intro
let intro = "";
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system:
        "You write the short opening paragraph of a weekly biotech digest for " +
        "Biology Uncoded. Plain and direct, no hype, no 'welcome back', no " +
        "'exciting'. If the week's posts share a thread, name it. If they do " +
        "not, say what they have in common at the level of 'three unrelated " +
        "things' rather than forcing a theme.",
      messages: [
        {
          role: "user",
          content:
            `Write 2-3 sentences introducing this week's posts. No heading, no sign-off.\n\n` +
            week.map((p) => `- ${p.title}: ${p.description}`).join("\n"),
        },
      ],
    });
    intro = res.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  } catch (err) {
    console.warn(`  intro generation failed (${err.message}) — sending without it`);
  }
}

// ---------------------------------------------------------------- compose
const range = (() => {
  const end = new Date();
  const start = new Date(Date.now() - DAYS * 864e5);
  const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
})();

const subject = `Biology Uncoded — ${week.length === 1 ? week[0].title : `the week in biotech, ${range}`}`;

const body = [
  intro,
  "",
  ...week.flatMap((p) => [
    `## [${p.title}](${urlFor(p.date, p.file)})`,
    "",
    p.description,
    "",
    `[Read it →](${urlFor(p.date, p.file)})`,
    "",
    "---",
    "",
  ]),
  `You're getting this because you subscribed at ${SITE_URL}.`,
  "",
  "{{ unsubscribe_url }}",
]
  .filter((line) => line !== undefined)
  .join("\n")
  .replace(/\n{3,}/g, "\n\n");

console.log(`\nSubject: ${subject}\n`);
console.log(body.slice(0, 700) + (body.length > 700 ? "\n…\n" : ""));

if (!SEND && !DRAFT) {
  console.log("\nPreview only. Pass --draft or --send to reach Buttondown.");
  process.exit(0);
}

// ---------------------------------------------------------------- send
const key = process.env.BUTTONDOWN_API_KEY;
if (!key) {
  console.error("BUTTONDOWN_API_KEY is not set — cannot reach Buttondown.");
  process.exit(1);
}

const res = await fetch("https://api.buttondown.com/v1/emails", {
  method: "POST",
  headers: {
    Authorization: `Token ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    subject,
    body,
    // about_to_send hands it to Buttondown's send pipeline immediately;
    // draft leaves it sitting in the dashboard for a human to look at.
    status: SEND ? "about_to_send" : "draft",
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Buttondown returned ${res.status}:\n${text.slice(0, 600)}`);
  process.exit(1);
}

let id = "";
try { id = JSON.parse(text).id || ""; } catch {}
console.log(`\n${SEND ? "Sent" : "Created as draft"}${id ? ` (id ${id})` : ""}.`);
