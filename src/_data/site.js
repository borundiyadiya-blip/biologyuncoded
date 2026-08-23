// Everything site-wide lives here. This is the one file to edit when the
// domain changes — nothing else hardcodes the URL.
export default {
  title: "Biology Uncoded",
  description: "Breaking biology's biggest mysteries into digestible bits",

  // No trailing slash. Change this when you move to a custom domain.
  // GitHub Pages project site: https://USERNAME.github.io/biologyuncoded
  // GitHub Pages user site:    https://USERNAME.github.io
  // Custom domain:             https://biologyuncoded.com
  url: process.env.SITE_URL || "https://example.github.io/biologyuncoded",

  author: {
    name: "Diya Borundiya",
    bio: "High school researcher working on transcriptomics, RNA biology, and CRISPR. I write about the papers and methods I'm reading.",
  },

  // Any link left empty is simply not rendered.
  links: {
    email: "",
    github: "",
    linkedin: "",
    bluesky: "",
    scholar: "",
  },

  // Shown in the footer next to the copyright.
  startYear: 2025,
};
