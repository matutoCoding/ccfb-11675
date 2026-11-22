// 内置亮星星表（J2000 赤道坐标 + 视星等，数据源自 Yale Bright Star Catalog / 常用亮星表）
// 暗于星等上限的部分由程序化星补充，保证球幕密度；亮星位置严格按星表。

import { Equatorial } from './astro';
import { deg2rad, Vec3, v3 } from './vec3';

export interface CatalogStar extends Equatorial {
  /** 视星等（越小越亮） */
  mag: number;
  name: string;
}

// RA 已换算为度（时角 ×15）
export const BRIGHT_STARS: CatalogStar[] = [
  { name: '天狼星 Sirius', raDeg: 101.287, decDeg: -16.716, mag: -1.46 },
  { name: '老人星 Canopus', raDeg: 95.988, decDeg: -52.696, mag: -0.74 },
  { name: '南门二 Rigil Kent', raDeg: 219.902, decDeg: -60.835, mag: -0.27 },
  { name: '大角星 Arcturus', raDeg: 213.915, decDeg: 19.182, mag: -0.05 },
  { name: '织女星 Vega', raDeg: 279.234, decDeg: 38.784, mag: 0.03 },
  { name: '五车二 Capella', raDeg: 79.172, decDeg: 45.998, mag: 0.08 },
  { name: '参宿七 Rigel', raDeg: 78.634, decDeg: -8.202, mag: 0.13 },
  { name: '南河三 Procyon', raDeg: 114.825, decDeg: 5.225, mag: 0.34 },
  { name: '水委一 Achernar', raDeg: 24.428, decDeg: -57.237, mag: 0.46 },
  { name: '参宿四 Betelgeuse', raDeg: 88.793, decDeg: 7.407, mag: 0.5 },
  { name: '马腹一 Hadar', raDeg: 210.956, decDeg: -60.373, mag: 0.61 },
  { name: '河鼓二 Altair', raDeg: 297.696, decDeg: 8.868, mag: 0.77 },
  { name: '十字架二 Acrux', raDeg: 186.649, decDeg: -63.099, mag: 0.77 },
  { name: '毕宿五 Aldebaran', raDeg: 68.98, decDeg: 16.509, mag: 0.85 },
  { name: '心宿二 Antares', raDeg: 247.352, decDeg: -26.432, mag: 1.06 },
  { name: '角宿一 Spica', raDeg: 201.298, decDeg: -11.161, mag: 1.04 },
  { name: '北河三 Pollux', raDeg: 116.329, decDeg: 28.026, mag: 1.14 },
  { name: '北落师门 Fomalhaut', raDeg: 344.413, decDeg: -29.622, mag: 1.16 },
  { name: '天津四 Deneb', raDeg: 310.358, decDeg: 45.28, mag: 1.25 },
  { name: '南十字三 Mimosa', raDeg: 191.93, decDeg: -59.689, mag: 1.25 },
  { name: '轩辕十四 Regulus', raDeg: 152.093, decDeg: 11.967, mag: 1.35 },
  { name: '大犬座ε Adhara', raDeg: 104.656, decDeg: -28.972, mag: 1.5 },
  { name: ' Castor 北河二', raDeg: 113.649, decDeg: 31.888, mag: 1.58 },
  { name: 'γ Velorum', raDeg: 122.392, decDeg: -47.337, mag: 1.78 },
  { name: '参宿五 Bellatrix', raDeg: 81.283, decDeg: 6.35, mag: 1.64 },
  { name: '南河二 Gomeisa', raDeg: 111.024, decDeg: 8.29, mag: 2.89 },
  { name: '尾宿八 Shaula', raDeg: 263.402, decDeg: -37.104, mag: 1.62 },
  { name: '参宿一 Alnitak', raDeg: 85.19, decDeg: -1.943, mag: 1.77 },
  { name: '参宿二 Alnilam', raDeg: 84.053, decDeg: -1.202, mag: 1.69 },
  { name: '参宿三 Mintaka', raDeg: 83.002, decDeg: -0.299, mag: 2.23 },
  { name: '北极星 Polaris', raDeg: 37.954, decDeg: 89.264, mag: 1.98 },
  { name: '玉衡 Alioth', raDeg: 193.507, decDeg: 55.96, mag: 1.76 },
  { name: '天枢 Dubhe', raDeg: 165.932, decDeg: 61.751, mag: 1.79 },
  { name: '摇光 Alkaid', raDeg: 206.885, decDeg: 49.313, mag: 1.86 },
  { name: '开阳 Mizar', raDeg: 200.981, decDeg: 54.925, mag: 2.27 },
  { name: '天璇 Merak', raDeg: 165.46, decDeg: 56.382, mag: 2.37 },
  { name: '天玑 Phecda', raDeg: 178.458, decDeg: 53.695, mag: 2.44 },
  { name: '天权 Megrez', raDeg: 183.857, decDeg: 57.033, mag: 3.31 },
  { name: '常陈一 Cor Caroli', raDeg: 194.007, decDeg: 38.318, mag: 2.9 },
  { name: '南三角α Atria', raDeg: 253.705, decDeg: -69.028, mag: 1.91 },
  { name: '孔雀十一 Peacock', raDeg: 306.412, decDeg: -56.735, mag: 1.94 },
  { name: '鹤二 Alnair', raDeg: 333.585, decDeg: -46.961, mag: 1.74 },
  { name: '土司空 Diphda', raDeg: 10.897, decDeg: -17.987, mag: 2.04 },
  { name: '蒭藁增二 Mira', raDeg: 34.833, decDeg: -2.978, mag: 3.0 },
  { name: '大陵五 Algol', raDeg: 47.042, decDeg: 40.956, mag: 2.09 },
  { name: '五车二旁 Menkalinan', raDeg: 89.872, decDeg: 44.947, mag: 1.9 },
  { name: '天船三 Mirfak', raDeg: 51.081, decDeg: 49.861, mag: 1.79 },
  { name: '辇道增七 Albireo', raDeg: 292.68, decDeg: 27.96, mag: 3.18 },
  { name: '织女旁 Sheliak', raDeg: 285.848, decDeg: 33.363, mag: 3.52 },
  { name: '箕宿三 Kaus Australis', raDeg: 276.042, decDeg: -34.385, mag: 1.85 },
  { name: '斗宿四 Nunki', raDeg: 283.816, decDeg: -26.297, mag: 2.05 },
  { name: '弧矢一 Wezen', raDeg: 107.098, decDeg: -26.393, mag: 1.83 },
  { name: '弧矢七 Aludra', raDeg: 115.087, decDeg: -29.303, mag: 2.45 },
  { name: '军市一 Mirzam', raDeg: 94.119, decDeg: -17.956, mag: 1.98 },
  { name: '星宿一 Alphard', raDeg: 141.897, decDeg: -8.659, mag: 1.99 },
  { name: '库楼三 Menkent', raDeg: 215.556, decDeg: -36.37, mag: 2.06 },
  { name: '贯索四 Alphecca', raDeg: 233.672, decDeg: 26.715, mag: 2.23 },
  { name: '七公二 Rasalhague', raDeg: 264.598, decDeg: 12.56, mag: 2.08 },
  { name: '室宿一 Markab', raDeg: 346.19, decDeg: 15.205, mag: 2.49 },
  { name: '室宿二 Scheat', raDeg: 345.945, decDeg: 28.083, mag: 2.42 },
  { name: '壁宿二 Alpheratz', raDeg: 2.197, decDeg: 29.09, mag: 2.06 },
  { name: '危宿三 Enif', raDeg: 326.046, decDeg: 9.875, mag: 2.39 },
  { name: '十字架γ Gacrux', raDeg: 187.791, decDeg: -57.113, mag: 1.63 },
  { name: '十字架δ Decrux', raDeg: 189.999, decDeg: -58.749, mag: 2.79 },
];

/** 确定性伪随机（mulberry32），保证每次加载星场一致 */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 程序化补充暗星：均匀球面分布，星等按亮度函数分配 */
export const generateFaintStars = (
  count: number,
  minMag: number,
  maxMag: number,
  seed = 20261123,
): CatalogStar[] => {
  const rnd = mulberry32(seed);
  const stars: CatalogStar[] = [];
  for (let i = 0; i < count; i++) {
    // 均匀球面
    const u = rnd();
    const v = rnd();
    const dec = Math.asin(2 * u - 1) * (180 / Math.PI);
    const ra = v * 360;
    // 星等偏向暗端：指数分布
    const t = Math.pow(rnd(), 2.2);
    const mag = minMag + t * (maxMag - minMag);
    stars.push({ name: `TYC-${i}`, raDeg: ra, decDeg: dec, mag });
  }
  return stars;
};

/** 取星表中亮于 magnitudeLimit 的全部星（亮星表 + 程序化暗星） */
export const selectStars = (magnitudeLimit: number): CatalogStar[] => {
  const bright = BRIGHT_STARS.filter((s) => s.mag <= magnitudeLimit);
  if (magnitudeLimit <= 3.5) return bright;
  // 暗星数量随星等门限增加（全天恒星密度的粗略近似）
  const count = Math.round(
    120 * Math.pow(2.512, Math.min(magnitudeLimit, 6.5) - 3.5),
  );
  const faint = generateFaintStars(count, 3.6, Math.min(magnitudeLimit, 6.5));
  return [...bright, ...faint];
};

/** 银河带方向采样（用于背景光带）：J2000 银极/银心参数 */
export const galacticToEquatorial = (lDeg: number, bDeg: number): Equatorial => {
  // J2000 银北极：RA=192.85948°, Dec=27.12825°；升交点 l=32.93192°
  const raNp = deg2rad(192.85948);
  const decNp = deg2rad(27.12825);
  const lAsc = deg2rad(32.93192);
  const l = deg2rad(lDeg);
  const b = deg2rad(bDeg);
  const dec = Math.asin(
    Math.sin(decNp) * Math.sin(b) +
      Math.cos(decNp) * Math.cos(b) * Math.cos(l - lAsc),
  );
  const ra =
    raNp +
    Math.atan2(
      Math.cos(b) * Math.sin(l - lAsc),
      Math.cos(decNp) * Math.sin(b) -
        Math.sin(decNp) * Math.cos(b) * Math.cos(l - lAsc),
    );
  return {
    raDeg: ((ra * 180) / Math.PI + 360) % 360,
    decDeg: (dec * 180) / Math.PI,
  };
};

/** 星等 → 点亮度（Pogson 指数，归一化到 0 等星 = 1） */
export const magnitudeToBrightness = (mag: number, gain: number): number => {
  const b = Math.pow(2.512, -mag) * gain;
  return Math.min(1, Math.max(0, b * 6.0));
};

/** 星等 → 点尺寸（像素半径的相对系数） */
export const magnitudeToSize = (mag: number): number => {
  if (mag <= 0) return 5.0;
  if (mag <= 1.5) return 4.0;
  if (mag <= 3) return 3.0;
  if (mag <= 4.5) return 2.4;
  return 1.8;
};

export const starColorForMag = (mag: number): Vec3 => {
  // 简化色温：最亮的几颗偏暖白/蓝白，其余近白
  if (mag <= 0.2) return v3(1.0, 0.93, 0.82);
  if (mag <= 1.5) return v3(0.88, 0.93, 1.0);
  return v3(0.92, 0.94, 1.0);
};
