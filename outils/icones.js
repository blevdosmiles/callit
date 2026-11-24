// Génère les icônes PNG à partir de icons/icon.svg (node outils/icones.js)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  const svg = fs.readFileSync('icons/icon.svg', 'utf8');
  for (const s of [180, 192, 512]) { await p.setViewportSize({ width: s, height: s }); await p.setContent(`<style>body{margin:0}</style>${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}`); await p.screenshot({ path: `icons/icon-${s}.png` }); }
  await b.close(); })();
