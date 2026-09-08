import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { marked } from "marked";
import config from "./blog.config.js";
import { fileURLToPath } from "url";

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

function renderPost(post) {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    description: post.description,
    tags: post.tags || [],
    content: marked(post.content),
  };
}

function loadAboutPage() {
  const aboutPath = path.join(__dirname, "about.md");
  const aboutContent = fs.readFileSync(aboutPath, "utf-8");
  const parsed = parseFrontmatter(aboutContent);
  return marked(parsed.content);
}

function renderSinglePage(posts) {
  const template = loadTemplate("app.html");

  // Convert posts to JSON for embedding in HTML
  const postsJson = JSON.stringify(posts.map(renderPost));

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
    .replace(/\{\{tagline\}\}/g, config.site.tagline)
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
      content_html: p.content,
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
    <content type="html">${escapeXml(p.content)}</content>
  </entry>`,
      )
      .join("\n")}
</feed>`;
  fs.writeFileSync(path.join(DIST_DIR, "atom.xml"), atom);

  // Sitemaps. The site's own pages go in sitemap-site.xml; sitemap.xml is an
  // index pointing at that plus each project that publishes its own sitemap,
  // so a project keeps ownership of its entries (aliasing-demo's carry hreflang
  // alternates that would be duplicated if they were inlined here).
  const projects = config.projects || [];
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
      const href = "/" + String(p.path).replace(/^\/+|\/+$/g, "") + "/";
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


function generateOgImage() {
  const svg = mondrianSVG(config.og.width, config.og.height, config.og.seed, 0, "", false);

  const svgPath = path.join(DIST_DIR, "_og.svg");
  const pngPath = path.join(__dirname, "assets", "og-image.png");
  fs.writeFileSync(svgPath, svg);

  try {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    execSync(
      `"${chrome}" --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1200,630 --screenshot="${pngPath}" "file://${svgPath}"`,
      { stdio: "pipe", timeout: 10000 },
    );
    console.log("  Generated OG image");
  } catch {
    console.log("  OG image: Chrome not available, using existing PNG");
  }

  try { fs.unlinkSync(svgPath); } catch {}
}

function mondrianSVG(W, H, seed, pad, bg, invert) {
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

  let inner = "";
  if (invert) {
    inner += `<rect width="${W}" height="${H}" fill="${red}"/>`;
  } else {
    inner += `<rect width="${W}" height="${H}" fill="#FFF"/>`;
    inner += `<rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" fill="none" stroke="${line}" stroke-width="${sw}" opacity="0.95"/>`;
  }

  function split(x, y, w, h, depth, id) {
    if (depth > 3 || w < minSz * 2 || h < minSz * 2) {
      if (hash(id, 0) > 0.15) {
        const fill = invert ? bg || "#F4F5F3" : fills[Math.floor(hash(id, 3) * fills.length)];
        const op = 0.3 + hash(id, 1) * 0.55;
        inner += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${op.toFixed(2)}"/>`;
      }
      return;
    }
    const ratio = 0.3 + hash(id, 2) * 0.4;
    if (hash(id, 3) > 0.5) {
      const sx = x + w * ratio;
      inner += `<line x1="${sx}" y1="${y}" x2="${sx}" y2="${y + h}" stroke="${invert ? (bg || "#F4F5F3") : line}" stroke-width="${lw}" opacity="${invert ? 0.3 : 0.6}"/>`;
      split(x, y, sx - x, h, depth + 1, id * 2);
      split(sx, y, x + w - sx, h, depth + 1, id * 2 + 1);
    } else {
      const sy = y + h * ratio;
      inner += `<line x1="${x}" y1="${sy}" x2="${x + w}" y2="${sy}" stroke="${invert ? (bg || "#F4F5F3") : line}" stroke-width="${lw}" opacity="${invert ? 0.3 : 0.6}"/>`;
      split(x, y, w, sy - y, depth + 1, id * 2);
      split(x, sy, w, y + h - sy, depth + 1, id * 2 + 1);
    }
  }
  split(pad, pad, W - pad * 2, H - pad * 2, 0, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

function generateCover(seed) {
  return mondrianSVG(600, 315, seed, 6, "", false);
}

function generatePostPages(posts) {
  const siteUrl = (config.site.url || "").replace(/\/+$/, "");
  const title = config.site.name;
  const rendered = posts.map(renderPost);

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
<meta property="og:image" content="${siteUrl}/assets/og-image.png">
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

  const indexHtml = renderSinglePage(posts);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml);
  console.log("  Generated index.html");

  generateFeeds(posts);
  generatePostPages(posts);

  generateOgImage();
  generateRobots();

  copyAssets();
  console.log("  Copied assets");

  console.log("Build complete!");
}

build();
