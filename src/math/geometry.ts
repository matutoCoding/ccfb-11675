// GPU 几何生成：单位球（经纬网格）、轨道圆环

import { Vec3, v3 } from './vec3';

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** 经纬球（单位半径），segments 经线数、rings 纬线数 */
export const makeSphere = (segments = 32, rings = 20): Geometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI; // 0..π
    const z = Math.cos(phi);
    const ringR = Math.sin(phi);
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = ringR * Math.cos(theta);
      const y = ringR * Math.sin(theta);
      positions.push(x, y, z);
      normals.push(x, y, z);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * row + s;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const idx =
    positions.length / 3 > 65535
      ? new Uint32Array(indices)
      : new Uint16Array(indices);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: idx,
  };
};

/** 轨道圆（线框，XY 平面，给定半径，分段数） */
export const makeOrbitRing = (radius: number, segments = 128): Geometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    positions.push(x, y, 0);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < segments; i++) indices.push(i, i + 1);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
};

/** 全屏四边形（两个三角形，NDC），用于鱼眼 warp pass */
export const makeQuad = (): Geometry => {
  const positions = new Float32Array([
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0,
  ]);
  const normals = new Float32Array(18);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return { positions, normals, indices };
};

/** 把方向数组打包为点精灵几何（位置在单位球面上） */
export const makePointCloud = (dirs: Vec3[]): Geometry => {
  const positions = new Float32Array(dirs.length * 3);
  const normals = new Float32Array(dirs.length * 3);
  dirs.forEach((d, i) => {
    positions[i * 3] = d.x;
    positions[i * 3 + 1] = d.y;
    positions[i * 3 + 2] = d.z;
    normals[i * 3] = d.x;
    normals[i * 3 + 1] = d.y;
    normals[i * 3 + 2] = d.z;
  });
  return {
    positions,
    normals,
    indices: new Uint16Array(0),
  };
};

export const UNIT_UP = v3(0, 0, 1);
