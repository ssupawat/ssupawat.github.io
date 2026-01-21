import { defineConfig } from "vite";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Run the custom build script
function runBuild() {
  console.log("\n🔄 Running custom build...");
  execSync("node build.js", { stdio: "inherit" });
  console.log("✅ Build complete\n");
}

export default defineConfig({
  // Configure Vite to serve from dist folder
  base: "/",
  publicDir: false,

  // Development server configuration
  server: {
    port: 3000,
    open: true,
  },

  // Preview server configuration (for production build)
  preview: {
    port: 4173,
    open: true,
  },

  // Custom plugin to run build on start and watch for changes
  plugins: [
    {
      name: "custom-build-and-watch",
      buildStart() {
        // Only run build in development mode
        if (process.env.NODE_ENV !== "production") {
          runBuild();
        }
      },

      // Watch for changes and serve from dist directory
      configureServer(server) {
        const contentDir = path.resolve(__dirname, "content");
        const templatesDir = path.resolve(__dirname, "templates");
        const assetsDir = path.resolve(__dirname, "assets");

        // Watch these directories
        const watchDirs = [contentDir, templatesDir, assetsDir];

        watchDirs.forEach((dir) => {
          if (fs.existsSync(dir)) {
            server.watcher.add(dir);
          }
        });

        // Rebuild on file changes
        server.watcher.on("change", (file) => {
          if (
            file.includes("content/") ||
            file.includes("templates/") ||
            file.includes("assets/")
          ) {
            console.log(
              `\n📝 File changed: ${path.relative(process.cwd(), file)}`,
            );
            runBuild();

            // Trigger full page reload in all connected clients
            server.ws.send({
              type: "full-reload",
              path: "*",
            });
          }
        });

        // Serve files from dist directory
        server.middlewares.use((req, res, next) => {
          // Skip Vite's internal requests
          if (req.url.startsWith('/@vite') || req.url.startsWith('/__vite')) {
            return next();
          }

          // Parse URL to remove query strings
          const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
          let reqPath = urlPath === "/" ? "/index.html" : urlPath;
          let distPath = path.join(process.cwd(), "dist", reqPath);

          // If no extension and file doesn't exist, try adding .html
          if (!path.extname(reqPath) && !fs.existsSync(distPath)) {
            distPath = path.join(process.cwd(), "dist", reqPath + ".html");
          }

          // If it's a directory, try index.html
          if (
            fs.existsSync(distPath) &&
            fs.statSync(distPath).isDirectory()
          ) {
            distPath = path.join(distPath, "index.html");
          }

          if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) {
            const ext = path.extname(distPath);
            const mimeTypes = {
              ".html": "text/html",
              ".css": "text/css",
              ".js": "text/javascript",
              ".json": "application/json",
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".gif": "image/gif",
              ".svg": "image/svg+xml",
              ".ico": "image/x-icon",
            };

            res.setHeader("Content-Type", mimeTypes[ext] || "text/plain");
            let content = fs.readFileSync(distPath, "utf-8");

            // Inject Vite's client script for HMR if it's an HTML file
            if (ext === ".html") {
              const viteScript = `<script type="module">
                import "/@vite/client";
              </script>`;
              content = content.replace("</body>", `${viteScript}</body>`);
            }

            res.end(content);
          } else {
            next();
          }
        });
      },
    },
  ],
});
