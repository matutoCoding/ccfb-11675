import { describe, it, expect } from 'vitest';
import {
  ndcToDir,
  dirToNdc,
  pixelToDir,
  dirToPixel,
  localToWorld,
  worldToLocal,
  angularResolutionRadPerPx,
  DomeGeometry,
} from './fisheye';

const G = {
  fov180: { fovDeg: 180, tiltDeg: 0, tiltAzimuthDeg: 0 } as DomeGeometry,
  fov210: { fovDeg: 210, tiltDeg: 0, tiltAzimuthDeg: 0 } as DomeGeometry,
  tilt15: { fovDeg: 180, tiltDeg: 15, tiltAzimuthDeg: 90 } as DomeGeometry,
  tilt210: { fovDeg: 210, tiltDeg: 23.4, tiltAzimuthDeg: 180 } as DomeGeometry,
};

describe('等距鱼眼：中心与边界锚点', () => {
  it('画面中心恒为（倾斜后的）球幕天顶轴', () => {
    for (const g of Object.values(G)) {
      const d = ndcToDir(0, 0, g)!;
      const expected = localToWorld({ x: 0, y: 0, z: 1 }, g);
      expect(d.x).toBeCloseTo(expected.x, 12);
      expect(d.y).toBeCloseTo(expected.y, 12);
      expect(d.z).toBeCloseTo(expected.z, 12);
    }
    // 零倾角时天顶轴就是世界 +Z
    const d0 = ndcToDir(0, 0, G.fov180)!;
    expect(d0.z).toBeCloseTo(1, 12);
    expect(Math.hypot(d0.x, d0.y)).toBeCloseTo(0, 12);
  });

  it('180° 画幅边缘 r=1 对应地平线（theta=90°，z=0）', () => {
    const d = ndcToDir(1, 0, G.fov180)!;
    expect(d.z).toBeCloseTo(0, 12);
    expect(d.x).toBeCloseTo(1, 12);
  });

  it('210° 画幅边缘 r=1 对应 theta=105°，z=cos105°（低于地平线）', () => {
    const d = ndcToDir(0, -1, G.fov210)!;
    expect(d.z).toBeCloseTo(Math.cos((105 * Math.PI) / 180), 12);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(
      Math.sin((105 * Math.PI) / 180),
      12,
    );
  });

  it('等距关系：r 与 theta 严格成正比', () => {
    const g = G.fov180;
    const half = Math.PI / 2;
    for (const r of [0.1, 0.25, 0.5, 0.75, 0.99]) {
      const d = ndcToDir(r, 0, g)!;
      const theta = Math.acos(d.z);
      expect(theta).toBeCloseTo(r * half, 12);
    }
  });

  it('圆外 r>1 返回 null（黑场）', () => {
    expect(ndcToDir(1.001, 0, G.fov180)).toBeNull();
    expect(ndcToDir(0.71, 0.71, G.fov180)).toBeNull();
  });
});

describe('等距鱼眼：往返闭合（dir→ndc→dir）', () => {
  // 选用高仰角方向（theta ≤ 60°），保证在最严苛的 210°+23.4° 倾角组合下仍在圆内
  const dirs = [
    { x: 0.5, y: 0, z: 0.866 },
    { x: 0, y: 0.5, z: 0.866 },
    { x: -0.3, y: 0.4, z: 0.866 },
    { x: 0.1, y: -0.2, z: 0.9747 },
    { x: 0, y: 0, z: 1 },
  ];
  for (const g of [G.fov180, G.fov210, G.tilt15, G.tilt210]) {
    it(`FOV=${g.fovDeg} tilt=${g.tiltDeg} 往返误差 < 1e-9`, () => {
      for (const raw of dirs) {
        const n = Math.hypot(raw.x, raw.y, raw.z);
        const d = { x: raw.x / n, y: raw.y / n, z: raw.z / n };
        const ndc = dirToNdc(d, g);
        expect(ndc).not.toBeNull();
        const back = ndcToDir(ndc!.nx, ndc!.ny, g)!;
        expect(back.x).toBeCloseTo(d.x, 9);
        expect(back.y).toBeCloseTo(d.y, 9);
        expect(back.z).toBeCloseTo(d.z, 9);
      }
    });
  }
});

describe('等距鱼眼：全像素网格往返的像素误差 < 0.5 px', () => {
  const size = 2048;
  for (const g of [G.fov180, G.fov210, G.tilt15, G.tilt210]) {
    it(`FOV=${g.fovDeg} tilt=${g.tiltDeg}（${size}px 网格抽样）`, () => {
      let maxErrPx = 0;
      const step = 17; // 抽样加速，覆盖各半径与方位
      for (let py = 0; py < size; py += step) {
        for (let px = 0; px < size; px += step) {
          const d = pixelToDir(px, py, size, g);
          if (!d) continue;
          const back = dirToPixel(d, size, g)!;
          const err = Math.hypot(back.px - px, back.py - py);
          if (err > maxErrPx) maxErrPx = err;
        }
      }
      // 纯数学往返应远低于半像素；留足浮点余量
      expect(maxErrPx).toBeLessThan(0.001);
    });
  }
});

describe('等距鱼眼：已知方向的像素位置手算核对', () => {
  it('180°、2048px：地平线北方向落在圆顶部中点', () => {
    const size = 2048;
    const p = dirToPixel({ x: 0, y: 1, z: 0 }, size, G.fov180)!;
    expect(p.px).toBeCloseTo((size - 1) / 2, 6); // 水平居中
    expect(p.py).toBeCloseTo(0, 6); // 圆顶
  });

  it('180°、2048px：theta=45° 方向 r = R·(45/90) = R/2', () => {
    const size = 2048;
    const R = (size - 1) / 2;
    const d = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 };
    const p = dirToPixel(d, size, G.fov180)!;
    expect(p.px).toBeCloseTo(R + R / 2, 6);
    expect(p.py).toBeCloseTo(R, 6);
  });

  it('210°、1024px：地平线（theta=90°）对应 r = R·(90/105)', () => {
    const size = 1024;
    const R = (size - 1) / 2;
    const p = dirToPixel({ x: 1, y: 0, z: 0 }, size, G.fov210)!;
    expect(p.px).toBeCloseTo(R + R * (90 / 105), 6);
    expect(p.py).toBeCloseTo(R, 6);
  });

  it('角分辨率：180°/2048 约 0.0879 度/像素', () => {
    const res = angularResolutionRadPerPx(2048, G.fov180);
    expect((res * 180) / Math.PI).toBeCloseTo(90 / 1023.5, 5);
  });
});

describe('球幕倾角', () => {
  it('零倾角时 localToWorld 为恒等', () => {
    const d = { x: 0.3, y: -0.2, z: 0.9327 };
    const out = localToWorld(d, G.fov180);
    expect(out.x).toBeCloseTo(d.x, 12);
    expect(out.y).toBeCloseTo(d.y, 12);
    expect(out.z).toBeCloseTo(d.z, 12);
  });

  it('倾角 15° 朝东：局部天顶向东偏 15°', () => {
    const zenith = localToWorld({ x: 0, y: 0, z: 1 }, G.tilt15);
    expect(zenith.x).toBeCloseTo(Math.sin((15 * Math.PI) / 180), 10);
    expect(zenith.y).toBeCloseTo(0, 10);
    expect(zenith.z).toBeCloseTo(Math.cos((15 * Math.PI) / 180), 10);
  });

  it('倾角旋转可逆', () => {
    const d = normalize3(0.4, -0.7, 0.59);
    const back = worldToLocal(localToWorld(d, G.tilt210), G.tilt210);
    expect(back.x).toBeCloseTo(d.x, 10);
    expect(back.y).toBeCloseTo(d.y, 10);
    expect(back.z).toBeCloseTo(d.z, 10);
  });
});

function normalize3(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}
