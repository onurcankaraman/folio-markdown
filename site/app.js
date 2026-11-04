const shot = document.querySelector('#app-shot');
for (const button of document.querySelectorAll('[data-theme]')) {
  button.addEventListener('click', () => {
    for (const item of document.querySelectorAll('[data-theme]'))
      item.setAttribute('aria-pressed', String(item === button));
    shot.src = `assets/folio-${button.dataset.theme}.png`;
  });
}
// Generated from published GitHub assets during deployment; no client API quota,
// no guessed file names and no links to unfinished builds.
fetch('releases.json')
  .then((r) => {
    if (!r.ok) throw new Error('unavailable');
    return r.json();
  })
  .then((release) => {
    if (!release.tag || !release.assets?.length) return;
    document.querySelector('#release-status').textContent =
      `${release.tag} · ${release.assets.length} indirilebilir dosya`;
    document.querySelector('#release-link').href = release.url;
    for (const platform of ['mac', 'windows', 'linux']) {
      const assets = release.assets.filter((asset) => asset.platform === platform);
      if (!assets.length) continue;
      const container = document.querySelector(`[data-platform="${platform}"]`);
      container.replaceChildren(
        ...assets.map((asset) => {
          const a = document.createElement('a');
          a.href = asset.url;
          a.textContent = asset.label;
          return a;
        }),
      );
    }
  })
  .catch(() => {});
