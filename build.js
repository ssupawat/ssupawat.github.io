const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const CONTENT_DIR = path.join(__dirname, "content");
const TEMPLATE_DIR = path.join(__dirname, "templates");
const ASSETS_DIR = path.join(__dirname, "assets");
const DIST_DIR = path.join(__dirname, "dist");

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const frontmatter = {};
  const lines = match[1].split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return {
    ...frontmatter,
    content: match[2].trim(),
  };
}

function slugify(filename) {
  return filename
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scanContent() {
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

function loadTemplate(name = "layout.html") {
  const templatePath = path.join(TEMPLATE_DIR, name);
  return fs.readFileSync(templatePath, "utf-8");
}

function renderPost(post, template) {
  const html = marked(post.content);

  return template
    .replace(/\{\{title\}\}/g, post.title)
    .replace(/\{\{date\}\}/g, post.date)
    .replace(/\{\{description\}\}/g, post.description)
    .replace(/\{\{content\}\}/g, html);
}

function renderHome(posts) {
  const template = loadTemplate("home.html");

  const postList = posts
    .map((post) => {
      return `    <li class="post-list-item">
      <a href="/${post.slug}.html">${post.title}</a>
      <div class="post-meta">${post.date}</div>
    </li>`;
    })
    .join("\n");

  return template.replace("{{postlist}}", postList);
}

function copyAssets() {
  const assetsDistDir = path.join(DIST_DIR, "assets");
  if (!fs.existsSync(assetsDistDir)) {
    fs.mkdirSync(assetsDistDir, { recursive: true });
  }

  const cssFile = path.join(ASSETS_DIR, "style.css");
  fs.copyFileSync(cssFile, path.join(assetsDistDir, "style.css"));
}

function build() {
  console.log("Building blog...");

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const posts = scanContent();
  console.log(`Found ${posts.length} posts`);

  const template = loadTemplate();

  posts.forEach((post) => {
    const html = renderPost(post, template);
    const outputPath = path.join(DIST_DIR, `${post.slug}.html`);
    fs.writeFileSync(outputPath, html);
    console.log(`  Generated ${post.slug}.html`);
  });

  const homeHtml = renderHome(posts, template);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), homeHtml);
  console.log("  Generated index.html");

  copyAssets();
  console.log("  Copied assets");

  console.log("Build complete!");
}

build();
