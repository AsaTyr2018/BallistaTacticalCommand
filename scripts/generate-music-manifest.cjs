const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const musicDir = path.join(projectRoot, "public", "music");
const manifestPath = path.join(musicDir, "manifest.json");

fs.mkdirSync(musicDir, { recursive: true });

const tracks = fs.readdirSync(musicDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
  .map((entry) => ({
    title: path.basename(entry.name, path.extname(entry.name)),
    src: `/music/${encodeURIComponent(entry.name)}`,
  }))
  .sort((a, b) => a.title.localeCompare(b.title, "en"));

fs.writeFileSync(manifestPath, `${JSON.stringify({ tracks }, null, 2)}\n`);
console.log(`Music manifest: ${tracks.length} track(s).`);
