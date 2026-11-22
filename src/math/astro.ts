// 天文计算：UTC/儒略日、格林尼治平恒星时、赤道坐标→水平坐标、行星日心轨道
// 精度定位：球幕预演级别（角分级误差可接受），公式引自 Meeus《Astronomical Algorithms》

import { Vec3, v3, normalize, deg2rad, rad2deg } from './vec3';

export const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
export const MS_PER_DAY = 86_400_000;

/** Date → 儒略日（UT） */
export const toJulianDate = (date: Date): number =>
  date.getTime() / MS_PER_DAY + 2_440_587.5;

/** J2000 起算的儒略世纪 */
export const julianCentury = (date: Date): number =>
  (toJulianDate(date) - 2_451_545.0) / 36_525;

/** 格林尼治平恒星时（度，0..360），Meeus 12.4 */
export const gmstDeg = (date: Date): number => {
  const jd = toJulianDate(date);
  const t = (jd - 2_451_545.0) / 36_525;
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2_451_545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38_710_000;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
};

/** 黄赤交角（度），Meeus 22.2 */
export const obliquityDeg = (date: Date): number => {
  const t = julianCentury(date);
  return 23.4392911 - 0.013004167 * t - 0.0000001639 * t * t;
};

export interface Equatorial {
  /** 赤经（度，0..360） */
  raDeg: number;
  /** 赤纬（度） */
  decDeg: number;
}

/** 赤道坐标（J2000，忽略岁差自行，预演足够）→ 站心水平方向单位向量。
 * 约定与 vec3.fromHoriz 一致：x 东、y 北、z 天顶，az 北起顺时针。
 */
export const equatorialToHorizon = (
  eq: Equatorial,
  observer: { latitudeDeg: number; longitudeDeg: number },
  date: Date,
): Vec3 => {
  const lst = deg2rad(gmstDeg(date) + observer.longitudeDeg);
  const ha = lst - deg2rad(eq.raDeg); // 时角
  const dec = deg2rad(eq.decDeg);
  const lat = deg2rad(observer.latitudeDeg);

  const sinAlt =
    Math.sin(dec) * Math.sin(lat) +
    Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(ha),
    Math.sin(dec) * Math.cos(lat) -
      Math.cos(dec) * Math.sin(lat) * Math.cos(ha),
  );
  // 上面的 atan2 给出北起顺时针的方位角（东为正），与本系统约定一致
  const ce = Math.cos(alt);
  return v3(ce * Math.sin(az), ce * Math.cos(az), Math.sin(alt));
};

/** J2000 平均轨道根数（Meeus 表 21A，线性项，T 为 J2000 起世纪数） */
export interface OrbitElements {
  a: number; // 半长轴 AU
  e: number; // 偏心率
  i: number; // 倾角 度
  L: number; // 平黄经 度
  longPeri: number; // 近日点黄经 ϖ 度
  longNode: number; // 升交点黄经 Ω 度
}

const ELEMENTS: Record<string, OrbitElements> = {
  Mercury: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.2503235, longPeri: 77.45779628, longNode: 48.33076593 },
  Venus: { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.9790995, longPeri: 131.60246718, longNode: 76.67984255 },
  Earth: { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, longPeri: 102.93768193, longNode: 0 },
  Mars: { a: 1.52371034, e: 0.0933941, i: 1.84969142, L: -4.55343205, longPeri: -23.94362959, longNode: 49.55953891 },
  Jupiter: { a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, longPeri: 14.72847983, longNode: 100.47390909 },
  Saturn: { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, longPeri: 92.59887831, longNode: 113.66242448 },
  Uranus: { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, longPeri: 170.9542763, longNode: 74.01692503 },
  Neptune: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, longPeri: 44.96476227, longNode: 131.78422574 },
};

/** 世纪速率（每世纪增量，度/AU），Meeus 表 21A */
const RATES: Record<string, Omit<OrbitElements, 'a' | 'e' | 'i'> & { a: number; e: number; i: number }> = {
  Mercury: { a: 0.00000037, e: 0.00001906, i: -0.00594749, L: 149472.67411175, longPeri: 0.16047689, longNode: -0.12534081 },
  Venus: { a: 0.0000039, e: -0.00004107, i: -0.0007889, L: 58517.81538729, longPeri: 0.00268329, longNode: -0.27769418 },
  Earth: { a: 0.00000562, e: -0.00004392, i: -0.01305477, L: 35999.37244981, longPeri: 0.32327364, longNode: 0 },
  Mars: { a: 0.00001847, e: 0.00007882, i: -0.00813131, L: 19140.30268499, longPeri: 0.44441088, longNode: -0.29257343 },
  Jupiter: { a: -0.00011607, e: -0.00013253, i: -0.00183714, L: 3034.74612775, longPeri: 0.21252668, longNode: 0.20469106 },
  Saturn: { a: -0.0012506, e: -0.00050991, i: 0.00193609, L: 1222.49362201, longPeri: -0.41897216, longNode: -0.28867794 },
  Uranus: { a: -0.00196176, e: -0.00004397, i: -0.00242939, L: 428.48202785, longPeri: 0.40805281, longNode: 0.04240589 },
  Neptune: { a: 0.00026291, e: 0.00005105, i: 0.00035372, L: 218.45945325, longPeri: -0.32241464, longNode: -0.00508664 },
};

const wrap360 = (d: number): number => ((d % 360) + 360) % 360;

/** 解开普勒方程（牛顿迭代） */
const solveKepler = (mRad: number, e: number): number => {
  let e0 = mRad + e * Math.sin(mRad);
  for (let i = 0; i < 8; i++) {
    const f = e0 - e * Math.sin(e0) - mRad;
    const fp = 1 - e * Math.cos(e0);
    const delta = f / fp;
    e0 -= delta;
    if (Math.abs(delta) < 1e-9) break;
  }
  return e0;
};

/** 行星日心黄道坐标（J2000 平黄道），单位 AU，Meeus 算法简化版 */
export const heliocentricPosition = (
  name: keyof typeof ELEMENTS | string,
  date: Date,
): Vec3 => {
  const base = ELEMENTS[name];
  const rate = RATES[name];
  if (!base || !rate) return v3();
  const t = julianCentury(date);
  const a = base.a + rate.a * t;
  const e = base.e + rate.e * t;
  const inc = deg2rad(base.i + rate.i * t);
  const L = deg2rad(wrap360(base.L + rate.L * t));
  const peri = deg2rad(wrap360(base.longPeri + rate.longPeri * t));
  const node = deg2rad(wrap360(base.longNode + rate.longNode * t));

  const m = L - peri; // 平近点角
  const ecc = solveKepler(m, e);
  const v = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(ecc / 2),
    Math.sqrt(1 - e) * Math.cos(ecc / 2),
  ); // 真近点角
  const r = a * (1 - e * Math.cos(ecc));
  const xOrb = r * Math.cos(v);
  const yOrb = r * Math.sin(v);

  // 轨道面 → 黄道面
  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosW = Math.cos(peri - node);
  const sinW = Math.sin(peri - node);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  const xEcl =
    (cosW * cosO - sinW * sinO * cosI) * xOrb +
    (-sinW * cosO - cosW * sinO * cosI) * yOrb;
  const yEcl =
    (cosW * sinO + sinW * cosO * cosI) * xOrb +
    (-sinW * sinO + cosW * cosO * cosI) * yOrb;
  const zEcl = sinW * sinI * xOrb + cosW * sinI * yOrb;
  return v3(xEcl, yEcl, zEcl);
};

/** 黄道 J2000 坐标 → 赤道坐标（RA/Dec，度） */
export const eclipticToEquatorial = (ecl: Vec3, date: Date): Equatorial => {
  const eps = deg2rad(obliquityDeg(date));
  const xEq = ecl.x;
  const yEq = Math.cos(eps) * ecl.y - Math.sin(eps) * ecl.z;
  const zEq = Math.sin(eps) * ecl.y + Math.cos(eps) * ecl.z;
  const ra = wrap360(rad2deg(Math.atan2(yEq, xEq)));
  const dec = rad2deg(Math.atan2(zEq, Math.hypot(xEq, yEq)));
  return { raDeg: ra, decDeg: dec };
};

/** 行星站心水平方向（地心简化：日心行星 − 日心地球，再转地平） */
export const planetHorizonDirection = (
  name: string,
  observer: { latitudeDeg: number; longitudeDeg: number },
  date: Date,
): Vec3 => {
  const planet = heliocentricPosition(name, date);
  const earth = heliocentricPosition('Earth', date);
  const geo = {
    x: planet.x - earth.x,
    y: planet.y - earth.y,
    z: planet.z - earth.z,
  };
  const eq = eclipticToEquatorial(geo, date);
  return normalize(equatorialToHorizon(eq, observer, date));
};

/** 太阳站心水平方向（地球日心向量取反） */
export const sunHorizonDirection = (
  observer: { latitudeDeg: number; longitudeDeg: number },
  date: Date,
): Vec3 => {
  const earth = heliocentricPosition('Earth', date);
  const eq = eclipticToEquatorial(v3(-earth.x, -earth.y, -earth.z), date);
  return normalize(equatorialToHorizon(eq, observer, date));
};
