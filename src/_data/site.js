// Everything site-wide lives here. This is the one file to edit when the
// domain changes — nothing else hardcodes the URL.
export default {
  title: "Biology Uncoded",
  description: "Breaking biology's biggest mysteries into digestible bits",

  // No trailing slash. Change this when you move to a custom domain.
  // GitHub Pages project site: https://borundiyadiya-blip.github.io/biologyuncoded
  // GitHub Pages user site:    https://borundiyadiya-blip.github.io
  // Custom domain:             https://biologyuncoded.com
  url: process.env.SITE_URL || "https://borundiyadiya-blip.github.io/biologyuncoded",

  author: {
    name: "Diya Borundiya",
    bio: "High school researcher working on transcriptomics, RNA biology, and CRISPR. I write about the papers and methods I'm reading.",
  },

  // Any link left empty is simply not rendered.
  links: {
    email: "",
    github: "https://github.com/borundiyadiya-blip",
    linkedin: "",
    bluesky: "",
    scholar: "",
  },

  // Weekly digest. Leave `username` empty and no subscribe form is rendered
  // anywhere — the site simply has no newsletter until you fill it in.
  //
  // `username` is your Buttondown username, the one in the URL of your
  // Buttondown dashboard. Nothing secret goes here: the embed endpoint is
  // public by design. The API key that sends the digest lives in a repository
  // secret instead, never in this file.
  newsletter: {
    username: "",
    heading: "The week in biotech, once a week",
    blurb:
      "A short Sunday email: what actually happened in biotech this week, what it means, and links to the papers so you can check the claims yourself.",
    sendDay: "Sundays",
  },

  // Shown in the footer next to the copyright.
  startYear: 2025,
};
