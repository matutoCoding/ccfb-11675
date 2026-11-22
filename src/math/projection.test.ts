import { describe, it, expect } from 'vitest';
import {
  projectorBlendWeight,
  projectIntoProjector,
  coveringProjectors,
  seatViewDir,
  seatDistortionAngle,
  generateSeatGrid,
} from './projection';
import { Projector, Settings } from '../types';
import { fromHoriz, deg2rad } from './vec3';

const settings: Settings = {
  domeDiameterM: 16,
  domeTiltDeg: 0,
  domeTiltAzimuthDeg: 0,
  fov: 180,
  previewResolution: 1024,
  exportResolution: 2048,
  fps: 30,
};

const projector = (over: Partial<Projector>): Projector => ({
  id: 'p1',
  name: 'P1',
  enabled: true,
  azimuthDeg: 0,
  elevationDeg: 45,
  widthDeg: 60,
  heightDeg: 60,
  blendWidthDeg: 10,
  blendGamma: 2,
  rollDeg: 0,
  ...over,
});

describe('投影机分区', () => {
  it('光轴方向落在画面中心，归一化坐标 (0,0)', () => {
    const p = projector({});
    const axis = fromHoriz(deg2rad(0), deg2rad(45));
    const uv = projectIntoProjector(p, axis)!;
    expect(uv.nx).toBeCloseTo(0, 6);
    expect(uv.ny).toBeCloseTo(0, 6);
  });

  it('覆盖锥外的方向返回 null', () => {
    const p = projector({});
    const behind = fromHoriz(deg2rad(180), deg2rad(45));
    expect(projectIntoProjector(p, behind)).toBeNull();
  });

  it('融合带权重：画面中心为 1，向边缘单调衰减，边界处为 0', () => {
    const p = projector({ blendWidthDeg: 12, blendGamma: 1 });
    const axis = fromHoriz(deg2rad(0), deg2rad(45));
    expect(projectorBlendWeight(p, axis)).toBeCloseTo(1, 6);

    // 沿方位角方向扫描：权重单调不增，到达覆盖边界时为 0，边界外返回 0
    let prev = 1;
    let reachedZero = false;
    for (let az = 2; az <= 80; az += 2) {
      const dir = fromHoriz(deg2rad(az), deg2rad(45));
      const w = projectorBlendWeight(p, dir);
      expect(w).toBeLessThanOrEqual(prev + 1e-9);
      prev = w;
      if (w === 0) reachedZero = true;
    }
    expect(reachedZero).toBe(true);
    // 融合带内（靠近覆盖边缘）权重应在 0..1 之间
    const inner = projectorBlendWeight(
      p,
      fromHoriz(deg2rad(34), deg2rad(45)),
    );
    expect(inner).toBeGreaterThan(0);
    expect(inner).toBeLessThan(1);
  });

  it('两台投影机重叠区：总权重随重叠平滑变化', () => {
    const a = projector({ id: 'a', azimuthDeg: -20, widthDeg: 60 });
    const b = projector({ id: 'b', azimuthDeg: 20, widthDeg: 60 });
    const mid = fromHoriz(deg2rad(0), deg2rad(45));
    const list = coveringProjectors([a, b], mid);
    expect(list.length).toBe(2);
    for (const x of list) expect(x.weight).toBeGreaterThan(0);
  });

  it('禁用的投影机不参与覆盖', () => {
    const p = projector({ enabled: false });
    const axis = fromHoriz(deg2rad(0), deg2rad(45));
    expect(coveringProjectors([p], axis)).toHaveLength(0);
  });
});

describe('座位视场与畸变', () => {
  it('中心座位看天顶：视线与法线重合，畸变为 0', () => {
    const seat = { id: 'c', name: '中', x: 0, y: 0, z: -3 };
    const angle = seatDistortionAngle(
      seat,
      { x: 0, y: 0, z: 1 },
      settings,
    );
    expect(angle).toBeCloseTo(0, 6);
    const view = seatViewDir(seat, { x: 0, y: 0, z: 1 }, settings);
    expect(view.x).toBeCloseTo(0, 9);
    expect(view.y).toBeCloseTo(0, 9);
    expect(view.z).toBeCloseTo(1, 9);
  });

  it('偏心座位看地平线方向畸变最大，且为正角', () => {
    const seat = { id: 'e', name: '边', x: 4, y: 0, z: -3 };
    const center = seatDistortionAngle(seat, { x: 0, y: 0, z: 1 }, settings);
    const horizon = seatDistortionAngle(
      seat,
      { x: 1, y: 0, z: 0 },
      settings,
    );
    expect(horizon).toBeGreaterThan(center);
    expect(horizon).toBeGreaterThan(0);
  });

  it('座位网格生成数量与编号正确', () => {
    const seats = generateSeatGrid(3, 4, 2);
    expect(seats).toHaveLength(12);
    expect(seats[0].name).toBe('1排1座');
    // 对称布置，首座位 x 为负
    expect(seats[0].x).toBe(-3);
  });
});
