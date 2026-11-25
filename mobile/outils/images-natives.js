// Prépare les images sources des applis (icône, écran de démarrage) à partir de ../icons/icon.svg.
// Usage : node outils/images-natives.js && npm run icones
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const svg = fs.readFileSync(path.join(__dirname, '..', '..', 'icons', 'icon.svg'), 'utf8');
const sansFond = svg.replace(/<rect width="112" height="112" fill="#ebebe8"\/>/, '');
const sombre = s => s.replace(/#ebebe8/g, '#18181b').replace(/#16161a/g, '#ececea').replace(/#ffffff/g, '#232327').replace(/#0a7a44/g, '#4cc98a');
const page = (contenu, taille, logo, fond) => `<style>html,body{margin:0;width:${taille}px;height:${taille}px;background:${fond};display:flex;align-items:center;justify-content:center}</style>${contenu.replace('<svg ', `<svg width="${logo}" height="${logo}" `)}`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const sortie = path.join(__dirname, '..', 'assets');
  const faire = async (nom, html, taille, transparent) => { await p.setViewportSize({ width: taille, height: taille }); await p.setContent(html); await p.screenshot({ path: path.join(sortie, nom), omitBackground: !!transparent }); };
  await faire('icon-only.png', page(svg, 1024, 1024, '#ebebe8'), 1024);
  await faire('icon-foreground.png', page(sansFond, 1024, 700, 'transparent'), 1024, true);
  await faire('icon-background.png', page('<svg></svg>', 1024, 1, '#ebebe8'), 1024);
  await faire('splash.png', page(sansFond, 2732, 640, '#ebebe8'), 2732);
  await faire('splash-dark.png', page(sombre(sansFond), 2732, 640, '#18181b'), 2732);
  await b.close();
})();
