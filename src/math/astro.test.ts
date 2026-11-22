import { describe, it, expect } from 'vitest';
import {
  gmstDeg,
  equatorialToHorizon,
  sunHorizonDirection,
  heliocentricPosition,
  toJulianDate,
} from './astro';

describe('天文计算', () => {
  it('J2000 历元 GMST = 280.4606°（Meeus 基准值）', () => {
    const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    expect(toJulianDate(d)).toBeCloseTo(2451545.0, 6);
    expect(gmstDeg(d)).toBeCloseTo(280.46061837, 4);
  });

  it('北极星在北纬 40° 永远靠近北天极（仰角≈纬度，1.5° 极距内）', () => {
    const observer = { latitudeDeg: 40, longitudeDeg: 116.4 };
    const d = equatorialToHorizon(
      { raDeg: 37.954, decDeg: 89.264 },
      observer,
      new Date(Date.UTC(2026, 6, 1, 4, 0, 0)),
    );
    // 仰角在 40° 附近画半径 0.74° 的小圆，任意时刻偏差不超过极距
    const alt = Math.asin(d.z) * (180 / Math.PI);
    expect(Math.abs(alt - 40)).toBeLessThan(1.5);
    // 方位接近北（x 东向分量很小）
    expect(Math.abs(d.x)).toBeLessThan(0.03);
  });

  it('天赤道上的星在北纬 45° 上中天时恰好位于正南、仰角 45°', () => {
    // 选一颗 RA 与 LST 相同的虚构赤道星（ha=0，dec=0）
    const observer = { latitudeDeg: 45, longitudeDeg: 0 };
    const date = new Date(Date.UTC(2025, 2, 20, 12, 0, 0));
    const lst = gmstDeg(date); // 格林尼治 LST（经度 0）
    const d = equatorialToHorizon(
      { raDeg: lst, decDeg: 0 },
      observer,
      date,
    );
    const alt = Math.asin(d.z) * (180 / Math.PI);
    const az = Math.atan2(d.x, d.y) * (180 / Math.PI);
    expect(alt).toBeCloseTo(45, 6);
    expect(((az % 360) + 360) % 360).toBeCloseTo(180, 6);
  });

  it('地球轨道半径在 1 AU 附近，行星距离量级合理', () => {
    const d = new Date(Date.UTC(2026, 0, 15));
    const earth = heliocentricPosition('Earth', d);
    expect(Math.hypot(earth.x, earth.y, earth.z)).toBeCloseTo(1, 1);
    const jupiter = heliocentricPosition('Jupiter', d);
    const rJ = Math.hypot(jupiter.x, jupiter.y, jupiter.z);
    expect(rJ).toBeGreaterThan(4.8);
    expect(rJ).toBeLessThan(5.6);
  });

  it('太阳方向为单位向量且随日期变化', () => {
    const obs = { latitudeDeg: 39.9, longitudeDeg: 116.4 };
    const d1 = sunHorizonDirection(obs, new Date(Date.UTC(2026, 5, 21, 4, 0)));
    const d2 = sunHorizonDirection(obs, new Date(Date.UTC(2026, 11, 21, 4, 0)));
    for (const d of [d1, d2]) {
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    }
    const dot = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
    expect(Math.abs(dot)).toBeLessThan(0.999);
  });
});
