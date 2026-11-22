// 关键帧采样与缓动

import { Keyframe, AnimChannel } from '../types';
import { Vec3, v3, lerp } from './vec3';

export const easeLinear = (t: number): number => t;
export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeHold = (): number => 0; // 保持上一关键帧

const applyEasing = (t: number, easing: Keyframe['easing']): number => {
  switch (easing) {
    case 'easeInOut':
      return easeInOut(t);
    case 'hold':
      return easeHold();
    default:
      return easeLinear(t);
  }
};

/** 对单通道关键帧序列在时间 t（秒）处采样，返回数值数组 */
export const sampleChannel = (
  keyframes: Keyframe[],
  channel: AnimChannel,
  t: number,
  fallback: number[],
): number[] => {
  const frames = keyframes
    .filter((k) => k.channel === channel)
    .sort((a, b) => a.t - b.t);
  if (frames.length === 0) return fallback;
  if (t <= frames[0].t) return frames[0].value;
  if (t >= frames[frames.length - 1].t)
    return frames[frames.length - 1].value;

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const k = span < 1e-9 ? 0 : applyEasing((t - a.t) / span, a.easing);
      const dim = Math.max(a.value.length, b.value.length);
      const out: number[] = [];
      for (let j = 0; j < dim; j++) {
        const av = a.value[j] ?? 0;
        const bv = b.value[j] ?? 0;
        out.push(av + (bv - av) * k);
      }
      return out;
    }
  }
  return fallback;
};

/** 三维通道便捷采样 */
export const sampleVec3 = (
  keyframes: Keyframe[],
  channel: AnimChannel,
  t: number,
  fallback: Vec3,
): Vec3 => {
  const arr = sampleChannel(keyframes, channel, t, [
    fallback.x,
    fallback.y,
    fallback.z,
  ]);
  return lerp(fallback, v3(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0), 1);
};

/** 标量通道便捷采样 */
export const sampleScalar = (
  keyframes: Keyframe[],
  channel: AnimChannel,
  t: number,
  fallback: number,
): number => sampleChannel(keyframes, channel, t, [fallback])[0] ?? fallback;
