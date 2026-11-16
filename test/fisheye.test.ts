/** 鱼眼映射与天文计算的单元测试 */
import { describe, expect, it } from 'vitest';
import {
  applyCamRot, camRotMatrix, directionToPixel, pixelToDirection, rotX, Vec3,
} from '../src/core/fisheye';
import { equToHor, gmst, julianDate, planetEqu, solveKepler, sunEqu } from '../src/core/astro';

const DEG = Math.PI / 180;

function randDir(seedObj: { s: number }): Vec3 {
  seedObj.s = (seedObj.s * 1103515245 + 12345) & 0x7fffffff;
  const u = seedObj.s / 0x7fffffff;
  seedObj.s = (seedObj.s * 1103515245 + 12345) & 0x7fffffff;
  const v = seedObj.s / 0x7fffffff;
  const theta = Math.acos(1 - u); // [0, π/2] 偏半球
  const az = v * 2 * Math.PI;
  return [Math.sin(theta) * Math.sin(az), Math.sin(theta) * Math.cos(az), Math.cos(theta)];
}

describe('等距鱼眼映射', () => {
  const cases = [
    { size: 2048, fovDeg: 180, tiltDeg: 0 },
    { size: 2048, fovDeg: 180, tiltDeg: 15 },
    { size: 2048, fovDeg: 210, tiltDeg: 30 },
    { size: 4096, fovDeg: 210, tiltDeg: 7.5 },
  ];

  for (const p of cases) {
    it(`方向→像素→方向 闭环 (fov=${p.fovDeg}, tilt=${p.tiltDeg})`, () => {
      const seed = { s: 42 };
      let maxPxErr = 0;
      for (let i = 0; i < 20000; i++) {
        const d = randDir(seed);
        const px = directionToPixel(d, p);
        if (!px) continue;
        const d2 = pixelToDirection(px[0], px[1], p);
        expect(d2).not.toBeNull();
        // 角度误差换算回像素误差
        const dot = Math.min(1, Math.max(-1, d[0] * d2![0] + d[1] * d2![1] + d[2] * d2![2]));
        const angErr = Math.acos(dot);
        const pxErr = angErr / ((p.fovDeg / 2) * DEG) * (p.size / 2);
        maxPxErr = Math.max(maxPxErr, pxErr);
        // 像素坐标应严格可逆 (天顶附近方位角病态, 放宽容差)
        const px2 = directionToPixel(d2!, p);
        expect(px2![0]).toBeCloseTo(px[0], 6);
        expect(px2![1]).toBeCloseTo(px[1], 6);
      }
      // 远低于 0.5px 要求 (天顶附近 acos 病态会放大 float64 噪声)
      expect(maxPxErr).toBeLessThan(1e-3);
    });
  }

  it('天顶在图像中心', () => {
    const px = directionToPixel([0, 0, 1], { size: 2048, fovDeg: 180, tiltDeg: 0 });
    expect(px![0]).toBeCloseTo(1024, 10);
    expect(px![1]).toBeCloseTo(1024, 10);
  });

  it('正北在图像正上方, 地平在边缘', () => {
    const p = { size: 2048, fovDeg: 180, tiltDeg: 0 };
    const px = directionToPixel([0, 1, 0], p);
    expect(px![0]).toBeCloseTo(1024, 10);
    expect(px![1]).toBeCloseTo(0, 10);
    // 正东在右边缘
    const pe = directionToPixel([1, 0, 0], p);
    expect(pe![0]).toBeCloseTo(2048, 10);
    expect(pe![1]).toBeCloseTo(1024, 10);
  });

  it('等距性: 半径与天顶角成正比', () => {
    const p = { size: 2048, fovDeg: 180, tiltDeg: 0 };
    for (const alt of [75, 60, 45, 30, 15]) {
      const theta = (90 - alt) * DEG; // 距天顶角
      const px = directionToPixel([0, Math.sin(theta), Math.cos(theta)], p)!;
      const r = Math.hypot(px[0] - 1024, px[1] - 1024);
      expect(r).toBeCloseTo((theta / (Math.PI / 2)) * 1024, 10);
    }
  });

  it('210° 视场覆盖地平以下 15°', () => {
    const p = { size: 2048, fovDeg: 210, tiltDeg: 0 };
    // 天顶角 105° (地平以下 15°) 应在视场内
    const theta = 105 * DEG;
    const px = directionToPixel([0, Math.cos(theta) * -1 * 0 + Math.sin(theta) * 0, Math.cos(theta)], p);
    // 直接构造: 天顶角 105° 朝北
    const d: Vec3 = [0, Math.sin(theta), Math.cos(theta)];
    const px2 = directionToPixel(d, p)!;
    expect(px2).not.toBeNull();
    const r = Math.hypot(px2[0] - 1024, px2[1] - 1024);
    expect(r).toBeCloseTo((105 / 105) * 1024, 6); // 恰好在边缘
    void px;
  });

  it('倾角旋转: 正倾角球幕倾向观众席, 物理天顶内容移向图像上方', () => {
    // 倾角 15°: 物理天顶方向的内容, 在 domemaster 中偏离中心 15°
    const p = { size: 2048, fovDeg: 180, tiltDeg: 15 };
    const px = directionToPixel([0, 0, 1], p)!;
    const r = Math.hypot(px[0] - 1024, px[1] - 1024);
    expect(r).toBeCloseTo((15 / 90) * 1024, 6);
    // 球幕倾向观众(-Y), 物理天顶内容偏向 +Y (北), 即图像上方
    expect(px[1]).toBeLessThan(1024);
    expect(Math.abs(px[0] - 1024)).toBeLessThan(1e-6);
  });

  it('rotX 与相机旋转为正交旋转', () => {
    const d: Vec3 = [0.3, 0.5, 0.8];
    const r = rotX(d, 25);
    expect(Math.hypot(...r)).toBeCloseTo(Math.hypot(...d), 12);
    const m = camRotMatrix(33, -20);
    // 列向量应为单位正交 (Float32 存储, 容忍 1e-6)
    for (const c of [0, 1, 2]) {
      expect(Math.hypot(m[c * 3], m[c * 3 + 1], m[c * 3 + 2])).toBeCloseTo(1, 6);
    }
    const d2 = applyCamRot(d, 33, -20);
    expect(Math.hypot(...d2)).toBeCloseTo(Math.hypot(...d), 6);
  });
});

describe('天文计算', () => {
  it('J2000 的 GMST ≈ 280.46°', () => {
    const jd = 2451545.0;
    expect(gmst(jd)).toBeCloseTo(280.46061837, 4);
  });

  it('儒略日换算', () => {
    expect(julianDate(Date.UTC(2000, 0, 1, 12, 0, 0))).toBeCloseTo(2451545.0, 6);
  });

  it('春分点太阳赤纬≈0', () => {
    // 2025-03-20 09:01 UTC 春分
    const jd = julianDate(Date.UTC(2025, 2, 20, 9, 1, 0));
    const s = sunEqu(jd);
    expect(Math.abs(s.dec)).toBeLessThan(0.2);
    expect(s.ra).toBeCloseTo(0, 0);
  });

  it('天极的地平高度等于纬度', () => {
    const h = equToHor(0, 90, 39.9, 123.4);
    expect(h.alt).toBeCloseTo(39.9, 6);
  });

  it('开普勒方程求解', () => {
    for (const e of [0.01, 0.2, 0.7]) {
      for (const M of [0.1, 1.0, 2.5, 3.1]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });

  it('行星距离在合理范围', () => {
    const jd = julianDate(Date.UTC(2026, 10, 16));
    const mars = planetEqu('mars', jd);
    expect(mars.distAu).toBeGreaterThan(0.3);
    expect(mars.distAu).toBeLessThan(2.7);
    const jup = planetEqu('jupiter', jd);
    expect(jup.distAu).toBeGreaterThan(3.9);
    expect(jup.distAu).toBeLessThan(6.5);
  });
});
