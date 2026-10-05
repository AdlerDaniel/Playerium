const fs = require('node:fs/promises');
const path = require('node:path');
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac']);

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function scanDirectory(root) {
  const files = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase()) || /\.lrc$/i.test(entry.name))) {
        const stat = await fs.stat(fullPath);
        files.push({ name: entry.name, fullPath, relativePath: path.relative(root, fullPath).replaceAll('\\', '/'), size: stat.size, lastModified: stat.mtimeMs });
      }
    }
  }
  // Fail the scan rather than interpreting an unreadable subtree as deleted music.
  await visit(root);
  return files;
}
module.exports = { scanDirectory, isInside, AUDIO_EXTS };
