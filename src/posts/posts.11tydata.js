// Defaults applied to every file in src/posts/.
export default {
  layout: "layouts/post.njk",
  tags: ["posts"],

  eleventyComputed: {
    // Rebuilds WordPress's /YYYY/MM/DD/slug/ structure so every link that
    // already exists out in the world still resolves after the move.
    permalink(data) {
      if (data.permalink) return data.permalink;

      // Drafts render locally so you can preview them, but never ship.
      const isBuild = process.env.ELEVENTY_RUN_MODE === "build";
      if (data.draft && isBuild && !process.env.BUILD_DRAFTS) return false;

      const d = data.page.date;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `/${y}/${m}/${day}/${data.page.fileSlug}/index.html`;
    },

    eleventyExcludeFromCollections(data) {
      return Boolean(data.draft);
    },
  },
};
