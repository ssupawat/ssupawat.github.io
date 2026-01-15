# Simple Static Blog

A simple static blog built with vanilla HTML, CSS, and JavaScript.

## Features

- **Simple content creation**: Write blog posts in Markdown with YAML frontmatter
- **Fast and lightweight**: No JavaScript framework overhead
- **Typography-first design**: Clean, readable design with no borders
- **Dark mode support**: Automatic dark mode based on system preference
- **Static files**: Generated HTML works without a server
- **Auto-deployment**: GitHub Actions workflow included

## Getting Started

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Create a new blog post in `content/`:
```markdown
---
title: "Your Post Title"
description: "Brief summary"
date: "2026-01-14"
---

Your content here...
```

3. Build the site:
```bash
npm run build
```

4. Open `dist/index.html` in your browser

### Deployment

The easiest way to deploy is using GitHub Pages:

1. Push this repository to GitHub
2. Enable GitHub Pages in repository settings
3. Select "GitHub Actions" as the source
4. Push to `main` branch - it will auto-deploy

## Customization

### Styling

Edit `assets/style.css` to customize:
- Colors (CSS variables in `:root`)
- Typography
- Spacing
- Dark mode colors

### Templates

Edit `templates/layout.html` for post pages and `templates/home.html` for the home page.

### Build Script

The `build.js` file is a simple Node.js script that:
1. Scans `content/` for `.md` files
2. Parses YAML frontmatter
3. Converts Markdown to HTML using `marked`
4. Generates HTML files in `dist/`
