// Renders the ```mermaid fences in content/*.md to themed SVG files under
// content/diagrams/, named by a hash of the fence source.
//
// This runs by hand, not in CI. The deploy workflow does `npm ci` and would
// otherwise pull puppeteer and a 300MB Chromium on every push, so mermaid-cli
// is fetched through npx here and stays out of package.json. Run it whenever a
// diagram changes; `npm run build` fails with the command to run if an SVG is
// missing or out of date.
//
//   npm run diagrams
//   MERMAID_CHROMIUM=/path/to/chrome npm run diagrams   # reuse a local browser
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectDiagrams, diagramPath, DIAGRAMS_DIR } from "../lib/diagrams.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Mermaid's theme engine computes derived shades, so it rejects `currentColor`
// outright. Render with a real palette, then override by mermaid's own class
// names. A CSS rule beats the presentation attributes mermaid writes inline,
// which is what lets one file serve the light and dark pages alike.
function themeOverride(id) {
  return `
#${id} { color: inherit; }
#${id} .actor { fill: transparent; stroke: currentColor; stroke-opacity: .45; }
#${id} text.actor, #${id} text.actor > tspan { fill: currentColor; stroke: none; }
#${id} .actor-line { stroke: currentColor; stroke-opacity: .25; }
#${id} .messageLine0, #${id} .messageLine1 { stroke: currentColor; stroke-opacity: .85; }
#${id} .messageText { fill: currentColor; stroke: none; }
#${id} .note { fill: transparent; stroke: currentColor; stroke-opacity: .45; filter: none; }
#${id} .noteText, #${id} .noteText > tspan { fill: currentColor; stroke: none; }
#${id} .activation0, #${id} .activation1, #${id} .activation2 {
  fill: currentColor; fill-opacity: .14; stroke: none; }
#${id} .labelBox { fill: transparent; stroke: currentColor; stroke-opacity: .45; }
#${id} .labelText, #${id} .labelText > tspan,
#${id} .loopText, #${id} .loopText > tspan { fill: currentColor; stroke: none; }
#${id} .loopLine { stroke: currentColor; stroke-opacity: .4; }
#${id} #arrowhead path, #${id} marker path { fill: currentColor; stroke: none; }
`;
}

const MERMAID_CONFIG = {
  theme: "neutral",
  themeVariables: {
    fontFamily: "JetBrains Mono, SF Mono, Monaco, monospace",
    fontSize: "13px",
  },
  sequence: { actorMargin: 90, useMaxWidth: true, mirrorActors: false },
};

function render(source, hash) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mmd-"));
  const inFile = path.join(tmp, "in.mmd");
  const outFile = path.join(tmp, "out.svg");
  const cfgFile = path.join(tmp, "mermaid.json");
  const pupFile = path.join(tmp, "puppeteer.json");

  fs.writeFileSync(inFile, source);
  fs.writeFileSync(cfgFile, JSON.stringify(MERMAID_CONFIG));
  // Containers and CI images need the sandbox flags; a desktop Chrome ignores them.
  fs.writeFileSync(pupFile, JSON.stringify({
    ...(process.env.MERMAID_CHROMIUM ? { executablePath: process.env.MERMAID_CHROMIUM } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  }));

  execFileSync("npx", ["--yes", "@mermaid-js/mermaid-cli",
    "-i", inFile, "-o", outFile, "-b", "transparent",
    "-c", cfgFile, "-p", pupFile], { stdio: ["ignore", "ignore", "inherit"] });

  const id = "mmd-" + hash.slice(0, 8);
  const svg = fs.readFileSync(outFile, "utf8")
    .replaceAll("my-svg", id)
    .replace("</style>", themeOverride(id) + "</style>");
  fs.rmSync(tmp, { recursive: true, force: true });
  return svg;
}

const diagrams = collectDiagrams(ROOT);
if (!diagrams.length) {
  console.log("No mermaid fences found in content/.");
  process.exit(0);
}

fs.mkdirSync(path.join(ROOT, DIAGRAMS_DIR), { recursive: true });
let made = 0;
for (const d of diagrams) {
  const out = diagramPath(ROOT, d.hash);
  if (fs.existsSync(out)) {
    console.log(`  up to date  ${d.file}  ${d.hash.slice(0, 8)}`);
    continue;
  }
  process.stdout.write(`  rendering   ${d.file}  ${d.hash.slice(0, 8)} ... `);
  fs.writeFileSync(out, render(d.source, d.hash));
  console.log("done");
  made++;
}

// A diagram whose source changed leaves its old SVG behind, so clear anything
// no longer referenced. Otherwise the directory grows with every edit.
const live = new Set(diagrams.map((d) => d.hash + ".svg"));
for (const f of fs.readdirSync(path.join(ROOT, DIAGRAMS_DIR))) {
  if (f.endsWith(".svg") && !live.has(f)) {
    fs.unlinkSync(path.join(ROOT, DIAGRAMS_DIR, f));
    console.log(`  removed     ${f} (no longer referenced)`);
  }
}
console.log(made ? `\nRendered ${made} diagram(s). Commit content/diagrams/.` : "\nNothing to do.");
