import { describe, it, expect } from 'vitest';
import { sampleChannel, sampleScalar, sampleVec3 } from './keyframes';
import { Keyframe } from '../types';

const kf = (t: number, value: number[], easing: Keyframe['easing'] = 'linear'): Keyframe => ({
  id: `kf-${t}-${value.join('-')}-${easing}`,
  t,
  channel: 'position',
  value,
  easing,
});

describe('关键帧插值', () => {
  const frames: Keyframe[] = [
    kf(0, [0, 0, 0]),
    kf(2, [10, 20, 30], 'easeInOut'),
    kf(4, [20, 0, 0]),
  ];

  it('区间外钳制到首尾关键帧', () => {
    expect(sampleChannel(frames, 'position', -1, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(sampleChannel(frames, 'position', 9, [0, 0, 0])).toEqual([20, 0, 0]);
  });

  it('线性插值中点', () => {
    const v = sampleChannel(frames, 'position', 1, [0, 0, 0]);
    expect(v[0]).toBeCloseTo(5, 6);
    expect(v[1]).toBeCloseTo(10, 6);
    expect(v[2]).toBeCloseTo(15, 6);
  });

  it('easeInOut 中点仍为 0.5，端点导数为 0 区间值在线性两侧', () => {
    const mid = sampleChannel(frames, 'position', 3, [0, 0, 0]);
    expect(mid[0]).toBeCloseTo(15, 6);
    const early = sampleChannel(frames, 'position', 2.5, [0, 0, 0]);
    // easeInOut 在 t<0.5 时慢于线性
    expect(early[0]).toBeLessThan(12.5);
  });

  it('hold 缓动保持上一帧', () => {
    const hold: Keyframe[] = [
      { id: 'h1', t: 0, channel: 'opacity', value: [1], easing: 'hold' },
      { id: 'h2', t: 1, channel: 'opacity', value: [0], easing: 'linear' },
    ];
    expect(sampleScalar(hold, 'opacity', 0.9, 0.5)).toBe(1);
  });

  it('无关键帧时返回 fallback', () => {
    expect(sampleScalar([], 'opacity', 1, 0.7)).toBe(0.7);
    const v = sampleVec3([], 'scale', 1, { x: 1, y: 2, z: 3 });
    expect(v).toEqual({ x: 1, y: 2, z: 3 });
  });
});
