import { DateTime } from "luxon";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import markdownItAnchor from "markdown-it-anchor";
import markdownItFootnote from "markdown-it-footnote";

import site from "./src/_data/site.js";

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

  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "posts", limit: 25 },
    metadata: {
      language: "en",
      title: site.title,
      subtitle: site.description,
      base: site.url,
      author: { name: site.author.name },
    },
  });

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

  eleventyConfig.addFilter("absoluteUrl", (path) => {
    try {
      return new URL(path, site.url).href;
    } catch {
      return site.url;
    }
  });

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
