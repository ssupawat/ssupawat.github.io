# Simple Static Blog

A simple static blog built with vanilla JavaScript, using hash-based routing for a single-page application approach.

## Features

- **Simple content creation**: Write blog posts in Markdown with YAML frontmatter
- **Single-page app**: Hash-based client-side routing (`#/post-slug`)
- **Fast and lightweight**: No JavaScript framework overhead
- **Live reload**: Development server with hot reload
- **Dark mode support**: Automatic dark mode based on system preference
- **No server required**: Generated `index.html` works completely standalone

## Getting Started

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open http://localhost:3000 in your browser

The dev server will automatically rebuild and reload when you make changes to:
- `content/` - Blog posts
- `about.md` - About page
- `templates/` - HTML templates
- `assets/` - CSS files
- `blog.config.js` - Site configuration

### Creating Content

**Blog Posts:** Create files in `content/` with frontmatter:
```markdown
---
title: "Your Post Title"
description: "Brief summary"
date: "2026-01-14"
---

Your content here...
```

**About Page:** Edit `about.md` in the root directory.

**Configuration:** Edit `blog.config.js` to update:
- Tagline
- Social media links

### Build for Production

```bash
npm run build
```

This generates `dist/index.html` - a single self-contained file ready to deploy.
