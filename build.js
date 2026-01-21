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

function loadTemplate(name = "layout.html") {
  const templatePath = path.join(TEMPLATE_DIR, name);
  return fs.readFileSync(templatePath, "utf-8");
}

function renderPost(post) {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    description: post.description,
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
    tagline: config.tagline,
    social: config.social,
  });

  return template
    .replace("{{posts}}", postsJson)
    .replace("{{about}}", aboutJson)
    .replace("{{config}}", configJson);
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

  copyAssets();
  console.log("  Copied assets");

  console.log("Build complete!");
}

build();
