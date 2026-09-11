// Shared between the renderer (scripts/render-diagrams.mjs) and the build, so
// both agree on which fences exist and where each one's SVG lives.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { marked } from "marked";

export const DIAGRAMS_DIR = "content/diagrams";

// A fence may carry caption lines as mermaid comments:
//
//   ```mermaid
//   %% caption: What the diagram shows. Inline `code` is fine.
//   sequenceDiagram
//   ```
//
// Mermaid ignores `%%` lines, and the caption is excluded from the hash so
// rewording it never forces a re-render.
export function splitCaption(fence) {
  const caption = [];
  const source = [];
  for (const line of fence.split("\n")) {
    const m = line.match(/^\s*%%\s*caption:\s*(.*)$/);
    if (m) caption.push(m[1].trim());
    else source.push(line);
  }
  return { caption: caption.join(" ").trim(), source: source.join("\n").trim() };
}

export function hashSource(source) {
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
}

export function diagramPath(root, hash) {
  return path.join(root, DIAGRAMS_DIR, hash + ".svg");
}

// Find the mermaid fences by letting marked tokenise the markdown, rather than
// matching ``` pairs with a regex. A regex cannot see nesting, so a post that
// documents this workflow by showing a mermaid fence inside an outer fence
// would have its example quietly swapped for a rendered diagram. The tokeniser
// treats that outer fence as one code block, which is what it is.
export function mermaidFences(markdown) {
  const found = [];
  const walk = (tokens) => {
    for (const token of tokens) {
      if (token.type === "code" && token.lang === "mermaid") found.push(token.text);
      if (token.tokens) walk(token.tokens);
      if (token.items) walk(token.items);
    }
  };
  walk(marked.lexer(markdown));
  return found;
}

export function collectDiagrams(root) {
  const dir = path.join(root, "content");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    for (const fence of mermaidFences(text)) {
      const { caption, source } = splitCaption(fence);
      out.push({ file, caption, source, hash: hashSource(source) });
    }
  }
  return out;
}
