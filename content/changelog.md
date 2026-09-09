---
title: "What was built — changelog from one session"
description: "A deep technical breakdown of every feature, design decision, and dead end from one development session, with code."
date: "2025-08-01"
tags:
  - meta
  - changelog
---

## Stack

Vanilla JavaScript SPA. No React, no Vue, no build tool beyond Node. A single `index.html` contains the entire app. Posts are written in Markdown with YAML frontmatter. `marked` converts Markdown to HTML at build time. `build.js` (plain Node) reads the `content/` directory, parses frontmatter, renders HTML, and writes everything to `dist/`.

```js
function build() {
  const posts = scanContent();
  const indexHtml = renderSinglePage(posts);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml);
  generateFeeds(posts);
  generatePostPages(posts);
  generateOgImage();
  generateRobots();
  copyAssets();
}
```

The SPA uses hash-based routing. The router reads `window.location.hash`, matches it against known routes, and replaces `#app` innerHTML.

```js
function router() {
  const hash = decodeURIComponent(window.location.hash.slice(1)) || "/";
  if (hash === "/") renderHome();
  else if (hash === "/about") renderAbout();
  else if (hash === "/tags") renderTags();
  else if (hash.startsWith("/tag/")) renderTaggedPosts(hash.slice(5));
  else renderPost(hash.slice(1));
}
```

## Logo Evolution

Six iterations before landing.

1. `/ Blog` → 2. `/ ssupawat` → 3. algorithmic SVG → 4. `🎨 art` → 5. palette Material icon → 6. `art.`

The final version in the template:

```html
<a href="#/" class="logo" aria-label="Home">art.</a>
```

The period at the end is the only punctuation on the entire nav bar, giving it weight.

## Font Journey

Three phases. Phase 1: Georgia serif body + Inter headings + SF Mono dates — three voices. Phase 2: Courier everywhere — consistent but flat. Phase 3: Inter for prose, JetBrains Mono for metadata.

```css
body {
  font-family: "Inter", "Noto Sans Thai", system-ui, -apple-system, sans-serif;
}

.date, .tagline, .search-input, .post-nav-arrow {
  font-family: "JetBrains Mono", "SF Mono", "Monaco", monospace;
}
```

## Colors

Four CSS custom properties, each with one job.

```css
:root {
  --bg: #F4F5F3;      /* Paper — light background */
  --text: #151A21;    /* Ink — body text, dark surfaces */
  --accent: #2F6F6A;  /* Signal — links, buttons, art lines */
  --muted: #6B7280;   /* Slate — secondary text, dividers */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151A21;
    --text: #F4F5F3;
    --accent: #2F6F6A;
    --muted: #6B7280;
  }
}
```

Dark mode swaps Ink and Paper. Signal and Slate stay constant. The theme toggle writes these properties directly to `document.documentElement.style`, overriding the CSS.

```js
function setTheme(theme) {
  if (theme === "dark") {
    html.style.setProperty("--bg", "#151A21");
    html.style.setProperty("--text", "#F4F5F3");
  } else {
    html.style.setProperty("--bg", "#F4F5F3");
    html.style.setProperty("--text", "#151A21");
  }
}
```

## Algorithmic Art

Four iterations: circles-and-lines → random squares → grid squares → Mondrian recursive subdivision. The current algorithm:

```js
function mondrianSVG(W, H, seed, pad, bg, invert) {
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263 + seed) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) / 2147483648;
  }

  const red = "#E2231A", blue = "#1D4F9C", yellow = "#F5D522";
  const fills = [red, red, blue, blue, yellow, yellow, red, blue];
  const line = "#111";

  function split(x, y, w, h, depth, id) {
    // Stop at depth 4 or below minimum size
    if (depth > 3 || w < minSz * 2 || h < minSz * 2) {
      if (hash(id, 0) > 0.15) {
        const fill = fills[Math.floor(hash(id, 3) * fills.length)];
        const op = 0.3 + hash(id, 1) * 0.55;
        inner += `<rect x="${x}" y="${y}" width="${w}"
                         height="${h}" fill="${fill}"
                         opacity="${op.toFixed(2)}"/>`;
      }
      return;
    }

    // Split horizontally or vertically
    const ratio = 0.3 + hash(id, 2) * 0.4;
    if (hash(id, 3) > 0.5) {
      const sx = x + w * ratio;
      inner += `<line x1="${sx}" y1="${y}" x2="${sx}"
                      y2="${y + h}" stroke="${line}"/>`;
      split(x, y, sx - x, h, depth + 1, id * 2);
      split(sx, y, x + w - sx, h, depth + 1, id * 2 + 1);
    } else {
      const sy = y + h * ratio;
      inner += `<line x1="${x}" y1="${sy}" x2="${x + w}"
                      y2="${sy}" stroke="${line}"/>`;
      split(x, y, w, sy - y, depth + 1, id * 2);
      split(x, sy, w, y + h - sy, depth + 1, id * 2 + 1);
    }
  }

  split(pad, pad, W - pad * 2, H - pad * 2, 0, 1);
}
```

Each post gets a unique cover seeded from its slug:

```js
function generateCover(seed) {
  return mondrianSVG(600, 315, seed, 8, "", false);
}

// Inside generatePostPages:
let seed = 0;
for (let i = 0; i < p.slug.length; i++)
  seed = ((seed << 5) - seed + p.slug.charCodeAt(i)) | 0;
seed = Math.abs(seed);
```

The OG image is rasterized at build time:

```js
function generateOgImage() {
  const svg = mondrianSVG(1200, 630, 77, 0, "", false);
  fs.writeFileSync(svgPath, svg);
  // Screenshot with Chrome headless
  execSync(`"${chrome}" --headless=new --window-size=1200,630
            --screenshot="${pngPath}" "file://${svgPath}"`);
}
```

**Dead end: the hero.** A full-viewport Mondrian splash was built and removed. The code worked — `position: absolute; width: 100%; height: 100vh;` with the nav floating over it — but the user decided a full-screen abstract image did not fit as a reading surface.

## Icons

Migration from inline Lucide SVGs to Material Symbols, with two exceptions.

```html
<!-- Material Symbols: palette, person, theme, RSS, terminal, search -->
<span class="material-symbols-outlined">person</span>

<!-- Brand SVGs kept because Material has no brand logos -->
<svg>...GitHub octocat...</svg>
<svg>...Facebook f...</svg>
```

Material Symbols are a font, not SVG — declared as text with a single stylesheet.

## Footer

Two states. First: `position: fixed; bottom: 0;` — floating dock. Caused content overlap. Second: normal flow with a divider.

```css
.footer {
  padding: 2rem 0 1.5rem 0;
  margin-top: 3rem;
  border-top: 1px solid rgba(128, 128, 128, 0.2) !important;
}
```

## Client-Side Search

All posts are embedded in the page as JSON. The search is `posts.filter()` on each keystroke.

```js
function applyQuery(value) {
  const q = value.trim().toLowerCase();
  const filtered = q
    ? posts.filter((p) =>
        `${p.title} ${p.description} ${p.content.replace(/<[^>]+>/g, " ")}`
          .toLowerCase().includes(q))
    : posts;
  list.innerHTML = postListHtml(filtered);
  emptyEl.hidden = !(q && filtered.length === 0);
}

searchInput.addEventListener("input", (e) => applyQuery(e.target.value));
```

Only the `<ul>` is re-rendered — the input stays in the DOM, avoiding focus loss. HTML tags are stripped from body content before matching so that searching "div" does not match every post.

## Prev/Next Post Navigation

```js
function renderPost(slug) {
  const post = posts.find((p) => p.slug === slug);
  const idx = posts.findIndex((p) => p.slug === slug);
  const newer = idx > 0 ? posts[idx - 1] : null;
  const older = idx < posts.length - 1 ? posts[idx + 1] : null;

  const navHtml = newer || older ? `
    <nav class="post-nav">
      <div class="post-nav-item">
        ${newer ? `<span>← Newer</span><a href="#/${newer.slug}">${newer.title}</a>` : ""}
      </div>
      <div class="post-nav-item post-nav-right">
        ${older ? `<a href="#/${older.slug}">${older.title}</a><span>Older →</span>` : ""}
      </div>
    </nav>` : "";
}
```

## Share Button

```js
shareBtn.addEventListener("click", () => {
  const url = config.url + "/posts/" + post.slug + "/";
  if (navigator.share) {
    navigator.share({ title: post.title, url });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      shareBtn.textContent = "Copied!";
      setTimeout(() => {
        shareBtn.innerHTML = '<span class="material-symbols-outlined">link</span>';
      }, 1500);
    });
  }
});
```

## Feeds and Sitemap

Generated at build time by `build.js`. JSON Feed 1.1, Atom 1.0, `robots.txt`, and sitemaps.

```js
const feed = {
  version: "https://jsonfeed.org/version/1.1",
  title,
  home_page_url: siteUrl + "/",
  feed_url: siteUrl + "/feed.json",
  items: rendered.map((p) => ({
    id: siteUrl + "/posts/" + p.slug + "/",
    url: siteUrl + "/posts/" + p.slug + "/",
    title: p.title,
    date_published: p.date,
    summary: p.description,
    content_html: p.content,
  })),
};
```

`sitemap.xml` is an index rather than a flat list. `sitemap-site.xml` holds the home page, the posts, and any project without a sitemap of its own; a project that publishes one is referenced directly, so it keeps ownership of its own entries.

`robots.txt` only counts at the origin root, which makes this repo the one place on the domain where it takes effect. A robots.txt committed inside a project repo is served under a subdirectory and ignored.

## Per-Post OG Pages

Each post gets a static HTML page at `/posts/<slug>/index.html`. It is the canonical, crawlable address for the article: a `#/<slug>` fragment is not a separate URL to a search engine, so the text has to live here to be indexed at all.

```html
<title>Post Title — art.</title>
<meta name="description" content="Post description.">
<link rel="canonical" href="https://ssupawat.github.io/posts/hello/">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:title" content="Post Title">
<meta property="og:description" content="Post description.">
<meta property="og:image" content="https://ssupawat.github.io/assets/og-image.png">
<meta property="og:url" content="https://ssupawat.github.io/posts/hello/">
<meta property="article:published_time" content="2025-08-01">
<meta name="twitter:card" content="summary_large_image">
```

The body carries the title, date, tags, the algorithmic cover, and the full post HTML — the same `p.content` that `renderPost` already hands to the feeds.

**Two dead ends on the way here, and they pulled in opposite directions.** The first was `<meta http-equiv="refresh">`: Facebook's crawler followed the redirect before reading the OG tags and showed the generic site title instead of the post title.

Replacing it with `location.replace()` fixed the preview — social crawlers do not run JS, so they read the head and stop — but broke indexing instead. Googlebot *does* run JS, follows the redirect, and drops the fragment on normalisation, so `/posts/<slug>/` resolved to the home page. The sitemap was asking for a URL that behaved like a redirect away from itself. And it would not have mattered either way: the body held a cover image and a "Read more" link, so there was nothing on the page to index.

Both are gone. No redirect of any kind, and the article is on the page.

## Dark Mode

```js
function setTheme(theme) {
  if (theme === "dark") {
    html.style.setProperty("--bg", "#151A21");
    html.style.setProperty("--text", "#F4F5F3");
    localStorage.setItem("theme", "dark");
  } else {
    html.style.setProperty("--bg", "#F4F5F3");
    html.style.setProperty("--text", "#151A21");
    localStorage.setItem("theme", "light");
  }
}

// First visit: check saved preference, fall back to system
const saved = localStorage.getItem("theme");
const system = window.matchMedia("(prefers-color-scheme: dark)").matches;
setTheme(saved || (system ? "dark" : "light"));
```

## Thai Support

Slugifier preserves Thai Unicode:

```js
function slugify(filename) {
  return filename
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

Router decodes percent-encoded hashes:

```js
const hash = decodeURIComponent(window.location.hash.slice(1)) || "/";
```

## Subdirectory Deployment

Relative asset paths instead of absolute:

```html
<!-- Absolute: resolves at the origin root, wherever the page is served from -->
<link rel="stylesheet" href="/assets/style.css" />

<!-- Relative: resolves against the path the page is served from -->
<link rel="stylesheet" href="assets/style.css" />
```

The site is served from the origin root today, where both forms resolve the same way. The relative paths stayed anyway — they cost nothing, and the whole site can be remounted under a subdirectory without touching a single link.
