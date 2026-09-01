/**
 * Build the Chrome Web Store upload zip: dist/ucsc-schedule-exporter-<version>.zip
 * Contains only what the extension runs — manifest, icons, src/. No datasets'
 * raw sources, tests, docs, or node_modules.
 *
 * Run: npm run package
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));

const distDir = path.join(root, "dist");
const zipPath = path.join(distDir, `ucsc-schedule-exporter-${version}.zip`);

mkdirSync(distDir, { recursive: true });
rmSync(zipPath, { force: true });

execFileSync(
  "zip",
  [
    "-r",
    "-X", // no extra file attributes
    zipPath,
    "manifest.json",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "src",
    "-x",
    ".*",
    "-x",
    "*/.*",
  ],
  { cwd: root, stdio: "inherit" },
);

console.log(`\npackaged ${path.relative(root, zipPath)}`);
