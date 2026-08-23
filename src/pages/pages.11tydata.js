// Standalone pages imported from WordPress land here.
export default {
  layout: "layouts/base.njk",
  eleventyComputed: {
    permalink: (data) => data.permalink || `/${data.page.fileSlug}/index.html`,
  },
};
