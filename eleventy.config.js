import { DateTime } from "luxon";
import { HtmlBasePlugin } from "@11ty/eleventy";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownItAnchor from "markdown-it-anchor";
import markdownItFootnote from "markdown-it-footnote";

import site from "./src/_data/site.js";

// Page URLs already carry pathPrefix by the time anything joins them onto a
// base, so the base has to be the bare origin — not origin + basePath, which
// is what site.url is on a project site.
const ORIGIN = new URL(site.url).origin;

export default function (eleventyConfig) {
  // ---------------------------------------------------------------- passthrough
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  eleventyConfig.addWatchTarget("src/css/");

  // ---------------------------------------------------------------- plugins
  eleventyConfig.addPlugin(syntaxHighlight, {
    preAttributes: { tabindex: 0 },
  });

  // Applies pathPrefix to every href/src in the built HTML — including links
  // and images inside post Markdown, which no template filter can reach.
  // Registered exactly once: registering it twice double-prefixes every URL.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // The Atom feed is a plain template (src/feed.njk) rather than
  // @11ty/eleventy-plugin-rss. That plugin registers Eleventy's HtmlBasePlugin
  // twice — once in virtualTemplate.js and again via the rssPlugin it nests —
  // so every href/src in every page came out with the pathPrefix applied twice
  // on top of the theme's own `| url` filter, i.e. /biologyuncoded/biology-
  // uncoded/biologyuncoded/…, which broke every link and the stylesheet on the
  // deployed project site. It also shadowed our absoluteUrl filter. A 20-line
  // template we control is cheaper than working around both.

  // ---------------------------------------------------------------- markdown
  eleventyConfig.amendLibrary("md", (md) => {
    md.use(markdownItFootnote);
    md.use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.headerLink({ safariReaderFix: true }),
      level: [2, 3],
    });
    md.set({ html: true, breaks: false, linkify: true });
  });

  // ---------------------------------------------------------------- filters
  eleventyConfig.addFilter("readableDate", (d, zone = "utc") =>
    DateTime.fromJSDate(d, { zone }).toFormat("d LLLL yyyy")
  );

  eleventyConfig.addFilter("shortDate", (d, zone = "utc") =>
    DateTime.fromJSDate(d, { zone }).toFormat("dd LLL yy")
  );

  // Used by src/posts/posts.json to rebuild WordPress's /YYYY/MM/DD/slug/ URLs.
  eleventyConfig.addFilter("monthNum", (d) =>
    DateTime.fromJSDate(d, { zone: "utc" }).toFormat("MM")
  );

  eleventyConfig.addFilter("dayNum", (d) =>
    DateTime.fromJSDate(d, { zone: "utc" }).toFormat("dd")
  );

  eleventyConfig.addFilter("isoDate", (d) =>
    DateTime.fromJSDate(d, { zone: "utc" }).toISO()
  );

  eleventyConfig.addFilter("year", (d) =>
    DateTime.fromJSDate(d, { zone: "utc" }).toFormat("yyyy")
  );

  // Strip HTML/markdown noise and clamp to n characters on a word boundary.
  eleventyConfig.addFilter("excerpt", (content, n = 200) => {
    if (!content) return "";
    const text = String(content)
      .replace(/<figure[\s\S]*?<\/figure>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length <= n) return text;
    return text.slice(0, text.lastIndexOf(" ", n)) + "…";
  });

  // ~220 wpm, rounded up, floor of 1.
  eleventyConfig.addFilter("readingTime", (content) => {
    const words = String(content || "")
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
  });

  eleventyConfig.addFilter("slugifyTag", (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
  );

  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));

  // Named absUrl, not absoluteUrl: eleventy-plugin-rss registers an absoluteUrl
  // filter of its own, and plugins are applied *after* this function runs, so a
  // filter registered here under that name gets silently clobbered — and the
  // plugin's version is a no-op when called without a base. Feed this
  // pathPrefix-ed input: {{ page.url | url | absUrl }}
  eleventyConfig.addFilter("absUrl", (path) => {
    try {
      return new URL(path, ORIGIN).href;
    } catch {
      return ORIGIN;
    }
  });

  // Feed readers resolve nothing for you, so post bodies going into feed.xml
  // need absolute href/src. HtmlBasePlugin only rewrites .html output, and the
  // feed embeds templateContent directly, so do it here.
  const PREFIX = (process.env.PATH_PREFIX || "/").replace(/\/+$/, "");
  eleventyConfig.addFilter("absoluteLinks", (html) =>
    String(html ?? "").replace(
      /(\s(?:href|src)=")\/(?!\/)/g,
      (_m, attr) => `${attr}${ORIGIN}${PREFIX}/`
    )
  );

  // ---------------------------------------------------------------- collections
  eleventyConfig.addCollection("posts", (api) =>
    api
      .getFilteredByGlob("src/posts/**/*.md")
      .filter((p) => !p.data.draft)
      .sort((a, b) => b.date - a.date)
  );

  // Every user-facing tag, with counts, sorted by frequency then name.
  eleventyConfig.addCollection("tagList", (api) => {
    const counts = new Map();
    api
      .getFilteredByGlob("src/posts/**/*.md")
      .filter((p) => !p.data.draft)
      .forEach((p) => {
        (p.data.tags || [])
          .filter((t) => !["posts", "all"].includes(t))
          .forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
      });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  // Posts grouped by year, newest first — powers the archive page.
  eleventyConfig.addCollection("postsByYear", (api) => {
    const groups = new Map();
    api
      .getFilteredByGlob("src/posts/**/*.md")
      .filter((p) => !p.data.draft)
      .sort((a, b) => b.date - a.date)
      .forEach((p) => {
        const y = DateTime.fromJSDate(p.date, { zone: "utc" }).toFormat("yyyy");
        if (!groups.has(y)) groups.set(y, []);
        groups.get(y).push(p);
      });
    return [...groups.entries()].map(([year, posts]) => ({ year, posts }));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
