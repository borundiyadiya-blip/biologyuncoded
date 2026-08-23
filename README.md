# Biology Uncoded

The blog, as a static site. Posts are Markdown files in `src/posts/`, the site
is built by [Eleventy](https://www.11ty.dev/), and GitHub Actions publishes it
to GitHub Pages on every push to `main`.

---

## What's here

```
src/
  posts/            one Markdown file per post
  pages/            standalone pages imported from WordPress
  _data/site.js     title, URL, author, social links  ← edit this first
  _includes/        layouts
  css/style.css     the whole theme, one file
  images/           figures and post images
  about.md
tools/
  import-wordpress.mjs   WordPress export → Markdown
.github/workflows/
  deploy.yml        build + publish on push
```

---

## Setup, once

You need [Node.js 20 or newer](https://nodejs.org). Check with `node -v`.

```bash
npm install
npm start
```

`npm start` serves the site at <http://localhost:8080> and rebuilds when you
save a file.

---

## Importing everything from WordPress

1. Go to <https://wordpress.com/export/biologyuncoded.wordpress.com>
2. Choose **Export all**, then download the `.xml` file when the email arrives.
   (This works on the free plan.)
3. Put the file in this folder and run:

```bash
npm run import -- wordpress-export.xml
```

That converts every published post to Markdown, downloads the images into
`src/images/posts/`, and rewrites the image links to point at the local copies.

Useful flags:

```bash
npm run import -- export.xml --drafts     # bring drafts across too
npm run import -- export.xml --pages      # bring standalone pages across
npm run import -- export.xml --no-images  # keep images on wordpress.com
npm run import -- export.xml --force      # overwrite already-imported files
```

Re-running is safe. Files that already exist are skipped unless you pass
`--force`, so anything you've hand-edited survives a second import.

**After importing, spot-check about five posts.** WordPress HTML converts
cleanly most of the time, but embeds (YouTube, Twitter, PDFs) and unusual
blocks sometimes leave stray markup behind.

---

## Writing a post

Create `src/posts/2026-09-01-your-slug.md`:

```markdown
---
title: "The title, in quotes"
date: 2026-09-01
description: "One or two sentences. Used on the homepage and in search results."
tags:
  - "RNA biology"
  - "CRISPR"
---

Body text starts here.
```

The filename date sets the publish date and the URL. The rest of the filename
becomes the slug, so the file above publishes at `/2026/09/01/your-slug/`.

Add `draft: true` to the front matter to keep a post out of the published site.
Drafts still appear in `npm start` so you can preview them.

Images go in `src/images/` and are referenced as `/images/whatever.png`.

Code blocks are syntax highlighted — use ` ```r `, ` ```bash `, ` ```python `.

---

## Publishing to GitHub Pages

### First time

1. **Create the repository.** On GitHub, click **New repository**. Name it
   `biologyuncoded`. Leave it empty — no README, no `.gitignore`.

2. **Push this folder to it.** In a terminal, from inside this folder:

   ```bash
   git init -b main
   git add .
   git commit -m "Move Biology Uncoded off WordPress"
   git remote add origin https://github.com/YOUR-USERNAME/biologyuncoded.git
   git push -u origin main
   ```

   Git will ask you to sign in to GitHub the first time. Let it open the
   browser and authorise there — don't paste a token into a terminal you didn't
   open yourself.

3. **Turn on Pages.** Repository **Settings → Pages → Build and deployment →
   Source**, and pick **GitHub Actions**.

4. Push anything, or click **Run workflow** on the Actions tab. The first build
   takes about a minute. Your site appears at
   `https://YOUR-USERNAME.github.io/biologyuncoded/`.

5. **Set the URL** in `src/_data/site.js` so the RSS feed and social previews
   use absolute links. The workflow sets this automatically on GitHub, but it's
   worth having a sensible default for local builds.

### Every time after that

```bash
git add .
git commit -m "New post on whatever"
git push
```

The site rebuilds and redeploys itself. That's the whole workflow.

---

## Using a custom domain

1. Buy the domain wherever you like.
2. Repository **Settings → Pages → Custom domain**, enter it, save.
3. At your registrar, add these DNS records:

   | Type  | Name | Value                                                        |
   | ----- | ---- | ------------------------------------------------------------ |
   | A     | @    | `185.199.108.153`                                              |
   | A     | @    | `185.199.109.153`                                              |
   | A     | @    | `185.199.110.153`                                              |
   | A     | @    | `185.199.111.153`                                              |
   | CNAME | www  | `YOUR-USERNAME.github.io`                                      |

4. Wait for DNS, then tick **Enforce HTTPS**.
5. Update `url` in `src/_data/site.js`.

GitHub creates a `CNAME` file in the repo when you save the custom domain.
Leave it alone — it needs to stay.

---

## Things worth knowing before you switch over

- **Old links keep working.** Posts publish at `/YYYY/MM/DD/slug/`, the same
  structure WordPress used, so anything you've already shared still resolves —
  as long as you eventually point the same domain here.
- **Your 65 WordPress subscribers do not come with you.** WordPress.com owns
  that list and there's no export that plugs into a static site. If email
  matters, set up something like Buttondown or Listmonk and announce the move
  from WordPress before you stop posting there. Don't delete the WordPress site
  until you've done that.
- **Comments go away.** Static sites have no database. If you want them back,
  Giscus stores comments as GitHub Discussions and drops into `post.njk` in
  about ten lines.
- **Stats go away too.** GitHub Pages has no analytics. Plausible or GoatCounter
  are the lightweight options.

---

## Troubleshooting

**The build fails on GitHub but works locally.** Check that `package-lock.json`
is committed — `npm ci` in the workflow needs it.

**CSS is missing on the deployed site.** The `pathPrefix` isn't matching. If
you're on a project site (`username.github.io/biologyuncoded`), the workflow
handles this. If you moved to a custom domain, clear the custom domain field,
save, re-enter it, and save again — GitHub sometimes caches the old base path.

**A post shows raw HTML.** WordPress left a block the converter didn't handle.
Open the Markdown file and clean it up by hand; it's usually one embed.
