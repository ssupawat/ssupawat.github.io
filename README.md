# art.

Source for [ssupawat.github.io](https://ssupawat.github.io/). A static site with a small Node generator — no framework, no server.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000, rebuilds on change
npm run build    # → dist/
```

Pushing to `main` builds and deploys to GitHub Pages.

## Where to change things

| To | Edit |
| --- | --- |
| Write a post | add `content/<slug>.md` |
| Edit the About page | `about.md` |
| Change the tagline or the home page meta description | `site.tagline` / `site.description` in `blog.config.js` |
| List another project | add to `projects` in `blog.config.js` |
| Change the logo mark and tab icon | `assets/favicon.svg` — one file is both |
| Restyle | `assets/style.css` |
| Change page structure or routing | `templates/app.html` |

### Post frontmatter

```markdown
---
title: "Title"
description: "One line, used as the post's meta description"
date: "2026-01-31"
tags:
  - notes
---
```

`tags` must be a block list. `tags: [notes]` on one line is read as a string, not an array — the parser in `build.js` only walks indented `- ` lines.

### Projects

`projects` drives both the Projects list in the footer and the sitemap:

```js
{ name: "Aliasing in sampling", path: "aliasing-demo", description: "…", sitemap: true }
```

`path` is the repo name; the project is served at `https://ssupawat.github.io/<path>/`. Set `sitemap: true` only when that project publishes its own `sitemap.xml`, in which case it is referenced from the sitemap index rather than listed as a bare URL.

## Things that are easy to get wrong

- **`robots.txt` only counts at the origin root.** This repo is the one place on `ssupawat.github.io` where it takes effect — a robots.txt committed inside a project repo is served under a subdirectory and ignored.
- **`sitemap.xml` is an index, not a list.** Site pages live in `sitemap-site.xml`; projects with their own sitemap are referenced from the index.
- **A `#/…` fragment is not a separate URL to a crawler.** That is why `/posts/<slug>/` carries the whole article rather than a stub — the SPA is the browse surface, those pages are the addresses.
- **`build.js` never cleans `dist/`.** A local build can leave pages behind from content you deleted. CI is unaffected; it builds from a fresh checkout.
- **The OG image only regenerates where Chrome is at the macOS path** hard-coded in `generateOgImage()`. Everywhere else the committed `assets/og-image.png` is reused, which is why it is in git.

## Layout

```
content/         posts — markdown with frontmatter
about.md         the About page
templates/       app.html, the SPA shell
assets/          style.css, favicon.svg, og-image.png
blog.config.js   site, social, projects
build.js         the generator
vite.config.js   dev server, rebuilds on change
```
