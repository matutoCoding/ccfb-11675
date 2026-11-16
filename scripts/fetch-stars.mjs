// 从 HYG 数据库 (基于 Yale 亮星星表 / Hipparcos) 拉取亮星并生成精简星表 JSON
// 输出: src/data/stars.json  ——  [raDeg, decDeg, mag, name][]
import { writeFileSync, mkdirSync } from 'node:fs';

const SOURCES = [
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  'https://raw.githubusercontent.com/astronexus/HYG-Database/master/hyg/CURRENT/hygdata_v41.csv',
];

const MAG_LIMIT = 4.5;

function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  let text = null;
  for (const url of SOURCES) {
    try {
      console.log('下载:', url);
      const res = await fetch(url);
      if (res.ok) { text = await res.text(); break; }
      console.log('  HTTP', res.status);
    } catch (e) { console.log('  失败:', e.message); }
  }
  if (!text) { console.error('所有数据源均不可用'); process.exit(1); }

  const lines = text.split('\n');
  const header = parseCsvLine(lines[0]);
  const iRa = header.indexOf('ra'), iDec = header.indexOf('dec'),
        iMag = header.indexOf('mag'), iName = header.indexOf('proper');
  if (iRa < 0 || iDec < 0 || iMag < 0) { console.error('表头缺少字段', header.slice(0, 20)); process.exit(1); }

  const stars = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = parseCsvLine(line);
    const mag = parseFloat(f[iMag]);
    if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
    const raH = parseFloat(f[iRa]), dec = parseFloat(f[iDec]);
    if (!Number.isFinite(raH) || !Number.isFinite(dec)) continue;
    const name = (iName >= 0 ? f[iName] : '') || '';
    stars.push([
      Math.round(raH * 15 * 1e5) / 1e5,   // 小时 -> 度
      Math.round(dec * 1e5) / 1e5,
      Math.round(mag * 100) / 100,
      name,
    ]);
  }
  stars.sort((a, b) => a[2] - b[2]);
  mkdirSync('src/data', { recursive: true });
  writeFileSync('src/data/stars.json', JSON.stringify(stars));
  console.log(`已生成 src/data/stars.json,共 ${stars.length} 颗恒星 (mag <= ${MAG_LIMIT})`);
}

main();
