import fs from 'node:fs/promises';
import path from 'node:path';
const repo = 'onurcankaraman/folio-markdown';
const destination = path.resolve('site-dist');
await fs.rm(destination, { recursive: true, force: true });
await fs.cp('site', destination, { recursive: true });
let release;
const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
  headers: {
    Accept: 'application/vnd.github+json',
    ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
  },
});
if (response.ok) release = await response.json();
else if (response.status !== 404) throw new Error(`Release lookup failed (${response.status})`);
const assets = [];
for (const asset of release?.assets || []) {
  const match =
    /^Folio-([\d.]+)-(mac|windows|linux)-(arm64|x64|amd64|x86_64)(?:-(Setup|Portable))?\.(dmg|zip|exe|AppImage|deb)$/.exec(
      asset.name,
    );
  if (!match) continue;
  const [, , platform, arch, kind, extension] = match;
  const architecture =
    platform === 'mac'
      ? arch === 'arm64'
        ? 'Apple Silicon'
        : 'Intel'
      : arch === 'arm64'
        ? 'ARM64'
        : 'x64';
  const format =
    kind === 'Setup'
      ? 'Kurulum'
      : kind ||
        (extension === 'dmg' ? 'DMG' : extension === 'deb' ? 'DEB' : extension.toUpperCase());
  assets.push({ platform, label: `${architecture} · ${format}`, url: asset.browser_download_url });
}
await fs.writeFile(
  path.join(destination, 'releases.json'),
  JSON.stringify(
    {
      tag: release?.tag_name || null,
      url: release?.html_url || `https://github.com/${repo}/releases`,
      assets,
    },
    null,
    2,
  ),
);
await fs.writeFile(path.join(destination, '.nojekyll'), '');
console.log(`Site ready: ${assets.length} verified download links`);
