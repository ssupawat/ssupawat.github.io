# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **minimalist static blog** and educational project for learning web standards from first principles. The blog is built using vanilla HTML/CSS/JavaScript with a custom static site generator - no frameworks or dependencies beyond `marked.js` for Markdown parsing.

**Key Philosophy:** Inductive design - start from the core content (blog posts) and build outward to create the supporting architecture.

## Architecture

### Three-Tier System
1. **Source Control** (GitHub): Stores original content (.md files) and build scripts
2. **Build Automation** (GitHub Actions): Runs build script to convert Markdown → HTML
3. **Hosting** (GitHub Pages): Serves static files

### Build Process (build.js)
The custom Node.js build script performs four operations:
1. **Read**: Scan all `.md` files from `/content`
2. **Parse**: Extract frontmatter (title, description, date) and convert Markdown to HTML using `marked.js`
3. **Wrap**: Inject HTML content into `layout.html` template at `{{content}}` placeholder
4. **Write**: Generate individual HTML files in `/dist` directory

### Project Structure
```
blog/
├── content/           # Source markdown files with frontmatter
├── templates/         # HTML templates (layout.html with {{content}})
├── assets/           # CSS files (style.css)
├── build.js          # Node.js build script
└── dist/             # Generated HTML output (auto-generated)
```

## Design Principles

### Minimal Data Structure
Each post requires only 3 metadata fields:
- `title`: Post heading
- `description`: Short summary for home page listing
- `date`: Publication date (YYYY-MM-DD format)

### UI/UX Guidelines
- **Typography-first**: Focus on readability with clean, minimal design
- **No-border strategy**: Use spacing (margin/padding) and font weight instead of borders
- **ASCII decorations**: Use keyboard characters (like `#` for headers, `***` for separators, `[]` for links)
- **Vertical centering**: Home page content is centered vertically for better visual balance
- **Container width**: Max 700px for optimal reading line length
- **Light/Dark mode**: Defined color palettes for both modes

### Color Palette
- **Light Mode**: BG `#F9F9F9`, Text `#2D2D2D`, Link `#0066CC`
- **Dark Mode**: BG `#1A1A1A`, Text `#E0E0E0`, Link `#66B2FF`

## Build Script Logic

### Step 1: Indexing
- Scan `/content` directory for `.md` files
- Extract frontmatter metadata
- Generate URL-safe slugs from filenames
- Sort posts by date (newest first)

### Step 2: Post Generation
- Loop through each post
- Convert Markdown → HTML using `marked.js`
- Wrap in `layout.html` template
- Write individual HTML files to `/dist`

### Step 3: Home Generation
- Create index page with post listings
- Format: `(YYYY-MM-DD) # Title`
- Inject into template and write to `/dist/index.html`

## Development Workflow

**Workflow A (Standard):**
```
Local Write → Git Push → GitHub Actions Build → Deploy
```

**Workflow B (Quick Edit):**
```
GitHub.com UI Edit → Commit → GitHub Actions Build → Deploy
```

## Testing
- Local test: Open `/dist/index.html` directly in browser
- No build server required - static files work standalone

## Important Notes

- This is an **educational project** - prioritize simplicity and learning over optimization
- Keep solutions naive/straightforward rather than complex/abstract
- Don't add unnecessary abstractions or "future-proof" features
- The system design document (`system-design.md`) contains comprehensive design rationale
