// Icône 512 × 512 et bannière 1024 × 500 pour la fiche Google Play (dans mobile/store/).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const svg = fs.readFileSync(path.join(__dirname, '..', '..', 'icons', 'icon.svg'), 'utf8');
const sansFond = svg.replace(/<rect width="112" height="112" fill="#ebebe8"\/>/, '');
const OUT = path.join(__dirname, '..', 'store'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(`<style>body{margin:0}</style>${svg.replace('<svg ', '<svg width="512" height="512" ')}`);
  await p.screenshot({ path: path.join(OUT, 'icone-512.png') });
  await p.setViewportSize({ width: 1024, height: 500 });
  await p.setContent(`<style>
    body{margin:0;width:1024px;height:500px;background:#ebebe8;display:flex;align-items:center;gap:44px;padding:0 80px;box-sizing:border-box;font-family:Georgia,'Times New Roman',serif;color:#16161a}
    h1{font-size:92px;margin:0;line-height:1} h1 b{color:#0a7a44}
    p{font:500 30px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;margin:18px 0 0;color:#3a3a36}
  </style>${sansFond.replace('<svg ', '<svg width="230" height="230" ')}<div><h1>Call<b>It!</b></h1><p>Ta collection de cartes,<br>pensée pour l'Europe.</p></div>`);
  await p.screenshot({ path: path.join(OUT, 'banniere-1024x500.png') });
  await b.close();
})();
