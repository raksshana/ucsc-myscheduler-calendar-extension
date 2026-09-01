/**
 * Regenerate icons/icon{16,48,128}.png from icons/iconslug.jpg.
 * Uses macOS `sips` (built in). Run: npm run icons
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");
const src = path.join(dir, "iconslug.jpg");

for (const size of [16, 48, 128]) {
  execFileSync("sips", [
    "-s", "format", "png",
    "-z", String(size), String(size),
    src,
    "--out", path.join(dir, `icon${size}.png`),
  ]);
}
console.log("wrote icons/icon{16,48,128}.png from iconslug.jpg");
