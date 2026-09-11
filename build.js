import crypto from "crypto";
import fs from "fs";
import path from "path";
import { marked } from "marked";
import { splitCaption, hashSource, diagramPath } from "./lib/diagrams.mjs";
import config from "./blog.config.js";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, "content");
const TEMPLATE_DIR = path.join(__dirname, "templates");
const ASSETS_DIR = path.join(__dirname, "assets");
const DIST_DIR = path.join(__dirname, "dist");

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // YAML-style array: lines starting with "  - " after an empty-valued key
    if (value === "" || value === "[]") {
      const arr = [];
      while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
        i++;
        let item = lines[i].replace(/^\s+-\s/, "").trim();
        if (item.startsWith('"') && item.endsWith('"')) item = item.slice(1, -1);
        arr.push(item);
      }
      if (arr.length) frontmatter[key] = arr;
      continue;
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { ...frontmatter, content: match[2].trim() };
}

function slugify(filename) {
  return filename
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scanContent() {
  // Check if content directory exists
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("No content directory found, starting with empty blog");
    return [];
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md"));

  const posts = files
    .map((file) => {
      const filepath = path.join(CONTENT_DIR, file);
      const content = fs.readFileSync(filepath, "utf-8");
      const parsed = parseFrontmatter(content);

      if (!parsed) {
        console.error(`Failed to parse ${file}`);
        return null;
      }

      return {
        slug: slugify(file),
        filename: file,
        ...parsed,
      };
    })
    .filter((post) => post !== null);

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function loadTemplate(name) {
  const templatePath = path.join(TEMPLATE_DIR, name);
  return fs.readFileSync(templatePath, "utf-8");
}

// A ```mermaid fence is authored in the post and rendered ahead of time by
// `npm run diagrams`, which writes a themed SVG keyed by a hash of the fence.
// The build swaps the fence for that SVG.
//
// Rendering here instead would put puppeteer and a 300MB Chromium in every CI
// deploy, and client-side mermaid would leave the crawlable post page without
// a diagram at all.
//
// This hooks marked's renderer rather than matching ``` pairs in the raw text,
// so nesting is the tokeniser's problem. A post showing a mermaid fence inside
// an outer fence keeps its example, because marked sees one code block there.
const missingDiagrams = [];

// The dev server rebuilds on every keystroke-triggered save. Editing a mermaid
// fence changes its hash, so its SVG is missing until `npm run diagrams` runs
// again, and exiting there would kill the server exactly while a diagram is
// being worked on. Warn and carry on in dev; fail everywhere else, so a stale
// diagram still cannot ship.
const DEV = process.env.BLOG_DEV === "1";

marked.use({
  renderer: {
    code(code, infostring) {
      if (infostring !== "mermaid") return false; // default renderer handles it
      const { caption, source } = splitCaption(code);
      const svgFile = diagramPath(__dirname, hashSource(source));
      if (!fs.existsSync(svgFile)) {
        // Collected rather than thrown: marked wraps an exception from a
        // renderer in a "report this to marked" notice, which sends the reader
        // to the wrong place. reportMissingDiagrams() has the real advice.
        missingDiagrams.push(path.relative(__dirname, svgFile));
        return DEV
          ? `<figure class="wide-figure"><p><em>Diagram not rendered yet. ` +
            `Run <code>npm run diagrams</code>.</em></p></figure>\n`
          : "";
      }
      const svg = fs.readFileSync(svgFile, "utf8");
      const cap = caption ? `<figcaption>${marked.parseInline(caption)}</figcaption>` : "";
      return `<figure class="wide-figure">\n${svg}\n${cap}\n</figure>\n`;
    },
  },
});

// Posts are rendered at three call sites, so say this once per run. In dev
// each rebuild is a fresh process, so the next save reports again.
let reportedMissing = false;

function reportMissingDiagrams() {
  if (!missingDiagrams.length || reportedMissing) return;
  reportedMissing = true;
  console.error(DEV
    ? "\nDiagram(s) not rendered yet:"
    : "\nMissing rendered diagram(s) for mermaid fences:");
  for (const f of new Set(missingDiagrams)) console.error("  " + f);
  console.error("\n  Run `npm run diagrams`" + (DEV ? ".\n" : " and commit content/diagrams/.\n"));
  if (!DEV) process.exit(1);
}

function renderPost(post) {
  const content = marked(post.content);
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    description: post.description,
    tags: post.tags || [],
    content,
    feedContent: forFeed(content),
  };
}

// Feed readers strip <style> and inline <svg> but keep the text inside them,
// so a stylesheet arrives as a paragraph of CSS and a diagram as a run of
// stray labels. Remove both. The figcaption stays and says what the diagram
// showed, and the post page still carries the real thing.
function forFeed(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .trim();
}

function loadAboutPage() {
  const aboutPath = path.join(__dirname, "about.md");
  const aboutContent = fs.readFileSync(aboutPath, "utf-8");
  const parsed = parseFrontmatter(aboutContent);
  return marked(parsed.content);
}

// Short content hash of an asset, used to version its URL so a changed file is
// never served from cache under the old one.
function assetHash(name) {
  const file = path.join(ASSETS_DIR, name);
  if (!fs.existsSync(file)) return "0";
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
}


function renderSinglePage(posts) {
  const template = loadTemplate("app.html");

  // Convert posts to JSON for embedding in HTML
  const postsJson = JSON.stringify(posts.map(renderPost));
  reportMissingDiagrams();

  // Load and convert about page
  const aboutHtml = loadAboutPage();
  const aboutJson = JSON.stringify(aboutHtml);

  // Embed config data (without about)
  const configJson = JSON.stringify({
    site: config.site,
    social: config.social,
  });

  return template
    .replace("{{posts}}", postsJson)
    .replace("{{about}}", aboutJson)
    .replace("{{config}}", configJson)
    .replace(/\{\{description\}\}/g, config.site.description)
    .replace(/\{\{cssVersion\}\}/g, assetHash("style.css"))
    .replace(/\{\{ogVersion\}\}/g, assetHash("og-image.png"))
    .replace("{{projects}}", renderProjectsHtml())
    
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateFeeds(posts) {
  const siteUrl = (config.site.url || "").replace(/\/+$/, "");
  const title = config.site.name;
  const rendered = posts.map(renderPost);
  reportMissingDiagrams();

  // JSON Feed 1.1
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: siteUrl + "/",
    feed_url: siteUrl + "/feed.json",
    language: "en",
    items: rendered.map((p) => ({
      id: siteUrl + "/posts/" + p.slug + "/",
      url: siteUrl + "/posts/" + p.slug + "/",
      title: p.title,
      date_published: p.date,
      summary: p.description,
      content_html: p.feedContent,
    })),
  };
  fs.writeFileSync(path.join(DIST_DIR, "feed.json"), JSON.stringify(feed, null, 2));

  // Atom 1.0
  const updated = rendered.length ? rendered[0].date : new Date().toISOString();
  const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${siteUrl}/"/>
  <link rel="self" href="${siteUrl}/atom.xml"/>
  <id>${siteUrl}/</id>
  <updated>${updated}</updated>
${rendered
      .map(
        (p) => `  <entry>
    <title>${escapeXml(p.title)}</title>
    <id>${siteUrl}/posts/${p.slug}/</id>
    <link href="${siteUrl}/posts/${p.slug}/"/>
    <updated>${p.date}</updated>
    <summary>${escapeXml(p.description)}</summary>
    <content type="html">${escapeXml(p.feedContent)}</content>
  </entry>`,
      )
      .join("\n")}
</feed>`;
  fs.writeFileSync(path.join(DIST_DIR, "atom.xml"), atom);

  // Sitemaps. The site's own pages go in sitemap-site.xml; sitemap.xml is an
  // index pointing at that plus each project that publishes its own sitemap,
  // so a project keeps ownership of its entries (aliasing-demo's carry hreflang
  // alternates that would be duplicated if they were inlined here).
  // Only the projects hosted on this origin. One linked by `url` lives on
  // someone else's host, and a sitemap may only claim URLs under its own.
  const projects = (config.projects || []).filter((p) => p.path);
  const projectUrl = (p) => siteUrl + "/" + String(p.path).replace(/^\/+|\/+$/g, "") + "/";

  const siteUrls = [siteUrl + "/"]
    .concat(rendered.map((p) => siteUrl + "/posts/" + p.slug + "/"))
    .concat(projects.filter((p) => !p.sitemap).map(projectUrl));
  const siteMapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${siteUrls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join("\n")}
</urlset>`;
  fs.writeFileSync(path.join(DIST_DIR, "sitemap-site.xml"), siteMapXml);

  const indexed = [siteUrl + "/sitemap-site.xml"].concat(
    projects.filter((p) => p.sitemap).map((p) => projectUrl(p) + "sitemap.xml"),
  );
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed.map((u) => `  <sitemap><loc>${escapeXml(u)}</loc></sitemap>`).join("\n")}
</sitemapindex>`;
  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemapIndex);

  console.log("  Generated feed.json, atom.xml, sitemap.xml, sitemap-site.xml");
}


function generateRobots() {
  const siteUrl = (config.site.url || "").replace(/\/+$/, "");
  const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), robots);
  console.log("  Generated robots.txt");
}


function renderProjectsHtml() {
  const projects = config.projects || [];
  if (!projects.length) return "";
  const items = projects
    .map((p) => {
      // `path` is a project site on this origin; `url` is anything else, for a
      // project that has no page here to link to.
      const href = p.url || "/" + String(p.path).replace(/^\/+|\/+$/g, "") + "/";
      return `<li><a href="${escapeXml(href)}">${escapeXml(p.name)}</a>` +
        (p.description ? `<span>${escapeXml(p.description)}</span>` : "") + `</li>`;
    })
    .join("\n                        ");
  return `<nav class="projects" aria-label="Projects">
                    <h2>Projects</h2>
                    <ul>
                        ${items}
                    </ul>
                </nav>`;
}


// The OG image used to be a headless-Chrome --screenshot of the same SVG the
// covers use. Chrome exits 0 even when it cannot load the page, so a run that
// failed to read the file still "succeeded": it wrote a screenshot of Chrome's
// own error page over assets/og-image.png — into the source tree, not dist —
// and that got committed. The art is nothing but axis-aligned rectangles, so
// rasterising it here is both simpler and deterministic, and unlike a browser
// it is actually available in CI.
function generateOgImage() {
  const { width: W, height: H, seed } = config.og;
  const rgb = rasterize(mondrianOps(W, H, seed, 0, "", false), W, H);
  const pngPath = path.join(ASSETS_DIR, "og-image.png");
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, encodePNG(W, H, rgb));
  console.log("  Generated OG image");
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

// Paints the ops in order onto an opaque white canvas. Every op is an
// axis-aligned rectangle, so per-pixel coverage is just the overlap of the two
// spans — that is what antialiases the fractional edges of the split lines.
function rasterize(ops, W, H) {
  const rgb = Buffer.alloc(W * H * 3, 0xff);
  for (const op of ops) {
    const [r, g, b] = hexToRgb(op.fill);
    const left = op.x, right = op.x + op.w, top = op.y, bottom = op.y + op.h;
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(right));
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
    for (let y = y0; y < y1; y++) {
      const cy = Math.min(y + 1, bottom) - Math.max(y, top);
      if (cy <= 0) continue;
      for (let x = x0; x < x1; x++) {
        const cx = Math.min(x + 1, right) - Math.max(x, left);
        if (cx <= 0) continue;
        const a = op.opacity * cx * cy;
        const i = (y * W + x) * 3;
        rgb[i] = Math.round(rgb[i] + (r - rgb[i]) * a);
        rgb[i + 1] = Math.round(rgb[i + 1] + (g - rgb[i + 1]) * a);
        rgb[i + 2] = Math.round(rgb[i + 2] + (b - rgb[i + 2]) * a);
      }
    }
  }
  return rgb;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// 8-bit truecolour, one IDAT, filter 0 on every scanline. The art is flat
// colour, so deflate does the compressing and per-line filters buy nothing.
function encodePNG(W, H, rgb) {
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0;
    rgb.copy(raw, y * stride + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// The art is a list of axis-aligned, alpha-blended rectangles. Keeping it as
// data rather than as an SVG string is what lets the OG rasteriser and the
// cover SVGs share one definition instead of drifting apart. Strokes become
// explicit rects here: a stroke straddles its path, so each one is centred on
// the edge it draws, and the border's sides stop short of the corners so the
// overlap does not paint twice at 0.95 opacity.
function mondrianOps(W, H, seed, pad, bg, invert) {
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263 + seed) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) / 2147483648;
  }

  const red = "#E2231A", blue = "#1D4F9C", yellow = "#F5D522";
  const fills = [red, red, blue, blue, yellow, yellow, red, blue];
  const line = "#111";
  const sw = pad < 10 ? 1.5 : 2;
  const lw = pad < 10 ? 0.5 : 1;
  const minSz = pad < 10 ? 4 : 20;
  const rule = invert ? bg || "#F4F5F3" : line;

  const ops = [];
  const add = (x, y, w, h, fill, opacity) => ops.push({ x, y, w, h, fill, opacity });

  if (invert) {
    add(0, 0, W, H, red, 1);
  } else {
    add(0, 0, W, H, "#FFF", 1);
    const half = sw / 2;
    const x0 = pad - half, y0 = pad - half;
    const x1 = W - pad - half, y1 = H - pad - half;
    const span = W - pad * 2 + sw;
    add(x0, y0, span, sw, line, 0.95);                              // top
    add(x0, y1, span, sw, line, 0.95);                              // bottom
    add(x0, pad + half, sw, H - pad * 2 - sw, line, 0.95);          // left
    add(x1, pad + half, sw, H - pad * 2 - sw, line, 0.95);          // right
  }

  function split(x, y, w, h, depth, id) {
    if (depth > 3 || w < minSz * 2 || h < minSz * 2) {
      if (hash(id, 0) > 0.15) {
        const fill = invert ? bg || "#F4F5F3" : fills[Math.floor(hash(id, 3) * fills.length)];
        add(x, y, w, h, fill, +(0.3 + hash(id, 1) * 0.55).toFixed(2));
      }
      return;
    }
    const ratio = 0.3 + hash(id, 2) * 0.4;
    const op = invert ? 0.3 : 0.6;
    if (hash(id, 3) > 0.5) {
      const sx = x + w * ratio;
      add(sx - lw / 2, y, lw, h, rule, op);
      split(x, y, sx - x, h, depth + 1, id * 2);
      split(sx, y, x + w - sx, h, depth + 1, id * 2 + 1);
    } else {
      const sy = y + h * ratio;
      add(x, sy - lw / 2, w, lw, rule, op);
      split(x, y, w, sy - y, depth + 1, id * 2);
      split(x, sy, w, y + h - sy, depth + 1, id * 2 + 1);
    }
  }
  split(pad, pad, W - pad * 2, H - pad * 2, 0, 1);
  return ops;
}

function opsToSVG(ops, W, H) {
  const n = (v) => +v.toFixed(3);
  const inner = ops
    .map((o) => `<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" fill="${o.fill}" opacity="${o.opacity}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

function mondrianSVG(W, H, seed, pad, bg, invert) {
  return opsToSVG(mondrianOps(W, H, seed, pad, bg, invert), W, H);
}

function generateCover(seed) {
  return mondrianSVG(600, 315, seed, 6, "", false);
}

function generatePostPages(posts) {
  const siteUrl = (config.site.url || "").replace(/\/+$/, "");
  const title = config.site.name;
  const rendered = posts.map(renderPost);
  reportMissingDiagrams();

  const postsDir = path.join(DIST_DIR, "posts");
  fs.mkdirSync(postsDir, { recursive: true });

  rendered.forEach((p) => {
    const slugDir = path.join(postsDir, p.slug);
    fs.mkdirSync(slugDir, { recursive: true });

    // Seed from slug
    let seed = 0;
    for (let i = 0; i < p.slug.length; i++) seed = ((seed << 5) - seed + p.slug.charCodeAt(i)) | 0;
    seed = Math.abs(seed);

    const coverSvg = generateCover(seed);
    fs.writeFileSync(path.join(slugDir, "cover.svg"), coverSvg);

    const description = p.description || "";
    const tagsHtml = (p.tags || [])
      .map((t) => `<a href="${siteUrl}/#/tag/${encodeURIComponent(t)}">#${escapeXml(t)}</a>`)
      .join(" ");

    // This page carries the full post: it is the canonical, crawlable URL for
    // the article. The SPA at /#/<slug> is the browse and search surface, but a
    // fragment is not a separate URL to a search engine, so the text has to live
    // here to be indexed at all. Social crawlers, which do not run JS, read the
    // OG tags above and stop.
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeXml(p.title)} — ${escapeXml(title)}</title>
<meta name="description" content="${escapeXml(description)}">
<link rel="canonical" href="${siteUrl}/posts/${p.slug}/">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeXml(p.title)}">
<meta property="og:description" content="${escapeXml(description)}">
<meta property="og:image" content="${siteUrl}/assets/og-image.png?v=${assetHash("og-image.png")}">
<meta property="og:url" content="${siteUrl}/posts/${p.slug}/">
<meta property="article:published_time" content="${escapeXml(p.date || "")}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/atom+xml" href="${siteUrl}/atom.xml">
<link rel="alternate" type="application/feed+json" href="${siteUrl}/feed.json">
<style>
body{font-family:"Inter","Noto Sans Thai",system-ui,-apple-system,sans-serif;max-width:700px;margin:0 auto;padding:3rem 1.5rem;background:#F4F5F3;color:#151A21;line-height:1.7}
.site{font-family:"JetBrains Mono","SF Mono",Monaco,monospace;font-size:.9rem;margin:0 0 2rem}
.site a{text-decoration:none;font-weight:600}
h1{font-size:1.9rem;font-weight:600;line-height:1.25;margin:0 0 .5rem}
h2{font-size:1.25rem;font-weight:600;margin:2.5rem 0 .75rem}
h3{font-size:1.05rem;font-weight:600;margin:2rem 0 .5rem}
.meta{font-family:"JetBrains Mono","SF Mono",Monaco,monospace;color:#6B7280;font-size:.85rem;margin:0 0 2rem}
.meta a{color:#6B7280;text-decoration:none;margin-right:.4rem}
a{color:#2F6F6A}
.cover{margin-bottom:2.5rem}
.cover svg{max-width:100%;height:auto;display:block}
article img{max-width:100%;height:auto}
.wide-figure{margin:2.25rem 0;overflow-x:auto}
.wide-figure svg{max-width:100%;min-width:560px;height:auto;display:block}
.wide-figure figcaption{font-size:.85rem;opacity:.7;margin-top:.85rem;line-height:1.5}
@media(min-width:1060px){.wide-figure{width:920px;margin-left:calc((920px - 100%) / -2);overflow-x:visible}.wide-figure svg{min-width:0}}
pre{background:rgba(128,128,128,.12);padding:1rem;border-radius:6px;overflow-x:auto;font-size:.85rem;line-height:1.5}
code{font-family:"JetBrains Mono","SF Mono",Monaco,monospace;font-size:.9em}
:not(pre)>code{background:rgba(128,128,128,.14);padding:.1em .35em;border-radius:3px}
blockquote{margin:1.5rem 0;padding-left:1rem;border-left:3px solid rgba(128,128,128,.3);color:#6B7280}
table{border-collapse:collapse;width:100%;overflow-x:auto;display:block}
th,td{border:1px solid rgba(128,128,128,.3);padding:.4rem .6rem;text-align:left}
hr{border:0;border-top:1px solid rgba(128,128,128,.25);margin:2.5rem 0}
.back{margin-top:3rem;padding-top:1.5rem;border-top:1px solid rgba(128,128,128,.2);font-family:"JetBrains Mono","SF Mono",Monaco,monospace;font-size:.85rem}
@media(prefers-color-scheme:dark){body{background:#151A21;color:#F4F5F3}}
</style>
</head>
<body>
<p class="site"><a href="${siteUrl}/">${escapeXml(title)}</a></p>
<h1>${escapeXml(p.title)}</h1>
<p class="meta">${escapeXml(p.date || "")}${tagsHtml ? " · " + tagsHtml : ""}</p>
<div class="cover">${coverSvg}</div>
<article>${p.content}</article>
<p class="back"><a href="${siteUrl}/">← ${escapeXml(title)}</a></p>
</body>
</html>`;

    fs.writeFileSync(path.join(slugDir, "index.html"), html);
  });

  console.log(`  Generated ${rendered.length} post pages`);
}

function copyAssets() {
  const assetsDistDir = path.join(DIST_DIR, "assets");
  if (!fs.existsSync(assetsDistDir)) {
    fs.mkdirSync(assetsDistDir, { recursive: true });
  }

  // Copy all files from assets to dist/assets
  const files = fs.readdirSync(ASSETS_DIR);
  files.forEach((file) => {
    const srcPath = path.join(ASSETS_DIR, file);
    const stat = fs.statSync(srcPath);

    if (stat.isFile()) {
      fs.copyFileSync(srcPath, path.join(assetsDistDir, file));
    } else if (stat.isDirectory()) {
      // Recursively copy subdirectories (like images/)
      copyDirSync(srcPath, path.join(assetsDistDir, file));
    }
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function build() {
  console.log("Building blog...");

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const posts = scanContent();
  console.log(`Found ${posts.length} posts`);

  // Ahead of the pages: they stamp the OG image's content hash into their
  // og:image URL, so it has to exist in its final form before they are written.
  generateOgImage();

  const indexHtml = renderSinglePage(posts);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml);
  console.log("  Generated index.html");

  generateFeeds(posts);
  generatePostPages(posts);

  generateRobots();

  copyAssets();
  console.log("  Copied assets");

  console.log("Build complete!");
}

build();
