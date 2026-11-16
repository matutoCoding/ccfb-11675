/**
 * 天文计算: 恒星时、赤道→地平坐标、太阳/月亮/行星位置 (JPL 开普勒近似根数, 1800–2050)。
 * 精度: 行星约角分级, 月亮约 0.2°, 预演用途足够。
 */
import type { Vec3 } from './fisheye';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** 儒略日 (UT) */
export function julianDate(date: Date | number): number {
  const ms = typeof date === 'number' ? date : date.getTime();
  return ms / 86400000 + 2440587.5;
}

/** 格林尼治平恒星时(度) */
export function gmst(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - (T * T * T) / 38710000);
}

/** 地方平恒星时(度), lonDeg 东经为正 */
export function lst(jd: number, lonDeg: number): number {
  return norm360(gmst(jd) + lonDeg);
}

export interface Horizontal { alt: number; az: number } // 度; az 北起顺时针

/** 赤道坐标(J2000, 度) → 地平坐标。忽略岁差章动(预演足够)。 */
export function equToHor(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): Horizontal {
  const ha = (lstDeg - raDeg) * DEG;
  const dec = decDeg * DEG, lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(ha),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha),
  );
  return { alt: alt * RAD, az: norm360(az * RAD) };
}

/** 地平坐标 → 球幕空间单位向量 (+Z 天顶, +Y 北, +X 东) */
export function horToDome(altDeg: number, azDeg: number): Vec3 {
  const alt = altDeg * DEG, az = azDeg * DEG;
  const ca = Math.cos(alt);
  return [ca * Math.sin(az), ca * Math.cos(az), Math.sin(alt)];
}

/** 赤道坐标 → 球幕空间向量 */
export function equToDome(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): Vec3 {
  const h = equToHor(raDeg, decDeg, latDeg, lstDeg);
  return horToDome(h.alt, h.az);
}

/* ---------------- 太阳 ---------------- */

/** 太阳视黄经/赤道坐标 (精度 ~0.01°) */
export function sunEqu(jd: number): { ra: number; dec: number } {
  const n = jd - 2451545.0;
  const L = norm360(280.460 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * DEG;
  const lambda = norm360(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * RAD;
  return { ra: norm360(ra), dec };
}

/* ---------------- 月亮(简化解析, ~0.2°) ---------------- */

export function moonEqu(jd: number): { ra: number; dec: number; distKm: number } {
  const d = jd - 2451543.5;
  const Lp = norm360(218.316 + 13.176396 * d);          // 平黄经
  const M = norm360(357.5291 + 0.98560028 * d) * DEG;   // 太阳平近点角
  const Mp = norm360(134.963 + 13.064993 * d) * DEG;    // 月球平近点角
  const D = norm360(297.850 + 12.190749 * d) * DEG;     // 平距角
  const F = norm360(93.272 + 13.229350 * d) * DEG;      // 升交点角距
  const lon = Lp + 6.289 * Math.sin(Mp) - 1.274 * Math.sin(2 * D - Mp)
    + 0.658 * Math.sin(2 * D) - 0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F);
  const lat = 5.128 * Math.sin(F) + 0.281 * Math.sin(Mp + F) - 0.277 * Math.sin(Mp - F);
  const eps = 23.4393 * DEG;
  const l = lon * DEG, b = lat * DEG;
  const ra = Math.atan2(
    Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)) * RAD;
  const dec = Math.asin(
    Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) * RAD;
  const distKm = 385001 - 20905 * Math.cos(Mp) - 3699 * Math.cos(2 * D - Mp) - 2956 * Math.cos(2 * D);
  return { ra: norm360(ra), dec, distKm };
}

/* ---------------- 行星 (JPL 近似根数, 历元 J2000, 1800–2050) ---------------- */

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export interface PlanetElements {
  a: number; e: number; i: number; L: number; lp: number; node: number;       // 历元值
  da: number; de: number; di: number; dL: number; dlp: number; dnode: number; // 每儒略世纪变化率
  periodDays: number;
  nameZh: string;
  color: string;
  baseMag: number;   // 典型视星等(仅用于点大小)
}

export const PLANETS: Record<PlanetId, PlanetElements> = {
  mercury: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.25032350, lp: 77.45779628, node: 48.33076593, da: 0.00000037, de: 0.00001906, di: -0.00594749, dL: 149472.67411175, dlp: 0.16047689, dnode: -0.12534081, periodDays: 87.969, nameZh: '水星', color: '#b8a898', baseMag: -0.4 },
  venus:   { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.97909950, lp: 131.60246718, node: 76.67984255, da: 0.00000390, de: -0.00004107, di: -0.00078890, dL: 58517.81538729, dlp: 0.00268329, dnode: -0.27769418, periodDays: 224.701, nameZh: '金星', color: '#e8d8a0', baseMag: -4.4 },
  mars:    { a: 1.52371034, e: 0.09339410, i: 1.84969142, L: -4.55343205, lp: -23.94362959, node: 49.55953891, da: 0.00001847, de: 0.00007882, di: -0.00813131, dL: 19140.30268499, dlp: 0.44441088, dnode: -0.29257343, periodDays: 686.980, nameZh: '火星', color: '#d06038', baseMag: -1.5 },
  jupiter: { a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, lp: 14.72847983, node: 100.47390909, da: -0.00011607, de: -0.00013253, di: -0.00183714, dL: 3034.74612775, dlp: 0.21252668, dnode: 0.20469106, periodDays: 4332.589, nameZh: '木星', color: '#d8b890', baseMag: -2.2 },
  saturn:  { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, lp: 92.59887831, node: 113.66242448, da: -0.00125060, de: -0.00050991, di: 0.00193609, dL: 1222.49362201, dlp: -0.41897216, dnode: -0.28867794, periodDays: 10759.22, nameZh: '土星', color: '#e0cc98', baseMag: 0.5 },
  uranus:  { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, lp: 170.95427630, node: 74.01692503, da: -0.00196176, de: -0.00004397, di: -0.00242939, dL: 428.48202785, dlp: 0.40805281, dnode: 0.04240589, periodDays: 30688.5, nameZh: '天王星', color: '#98d8d8', baseMag: 5.7 },
  neptune: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, lp: 44.96476227, node: 131.78422574, da: 0.00026291, de: 0.00005105, di: 0.00035372, dL: 218.45945325, dlp: -0.32241464, dnode: -0.00508664, periodDays: 60182, nameZh: '海王星', color: '#6080e0', baseMag: 7.9 },
};

const EARTH = { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, lp: 102.93768193, node: 0, da: 0.00000562, de: -0.00004392, di: -0.01294668, dL: 35999.37244981, dlp: 0.32327364, dnode: 0 };

/** 解开普勒方程 M = E - e·sinE (E, M 弧度) */
export function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 12; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** 行星日心黄道坐标 (AU, J2000 黄道坐标系) */
export function planetHelio(el: PlanetElements | typeof EARTH, jd: number): Vec3 {
  const T = (jd - 2451545.0) / 36525;
  const a = el.a + el.da * T;
  const e = el.e + el.de * T;
  const i = (el.i + el.di * T) * DEG;
  const L = norm360(el.L + el.dL * T);
  const lp = norm360(el.lp + el.dlp * T);
  const node = norm360(el.node + el.dnode * T) * DEG;
  const w = (lp * DEG) - node;                    // 近日点幅角
  const M = norm360(L - (lp % 360)) * DEG;        // 平近点角
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

/** 黄道坐标 → 赤道坐标 (J2000) */
export function eclipticToEquatorial(v: Vec3): { ra: number; dec: number } {
  const eps = 23.4392911 * DEG;
  const [x, y, z] = v;
  const ra = Math.atan2(y * Math.cos(eps) - z * Math.sin(eps), x) * RAD;
  const dec = Math.asin(y * Math.sin(eps) + z * Math.cos(eps)) * RAD;
  return { ra: norm360(ra), dec };
}

/** 行星的地心赤道坐标 */
export function planetEqu(id: PlanetId, jd: number): { ra: number; dec: number; distAu: number } {
  const hp = planetHelio(PLANETS[id], jd);
  const he = planetHelio(EARTH, jd);
  const geo: Vec3 = [hp[0] - he[0], hp[1] - he[1], hp[2] - he[2]];
  const { ra, dec } = eclipticToEquatorial(geo);
  return { ra, dec, distAu: Math.hypot(geo[0], geo[1], geo[2]) };
}

/** 行星轨道采样点(地心赤道坐标序列, 用于画轨道线) */
export function planetOrbitPath(id: PlanetId, jd: number, samples = 180): { ra: number; dec: number }[] {
  const el = PLANETS[id];
  const he = planetHelio(EARTH, jd);
  const out: { ra: number; dec: number }[] = [];
  for (let k = 0; k <= samples; k++) {
    const jdK = jd - el.periodDays / 2 + (el.periodDays * k) / samples;
    const hp = planetHelio(el, jdK);
    const geo: Vec3 = [hp[0] - he[0], hp[1] - he[1], hp[2] - he[2]];
    out.push(eclipticToEquatorial(geo));
  }
  return out;
}
