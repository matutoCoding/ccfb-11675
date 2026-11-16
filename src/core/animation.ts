/** 关键帧动画求值 */
import { AnimProps, Keyframe, Show } from './types';

export const ANIM_PROP_KEYS: (keyof AnimProps)[] = [
  'skyTime', 'lat', 'lon', 'camYaw', 'camPitch', 'planetScale', 'magLimit',
];

export const ANIM_PROP_LABELS: Record<keyof AnimProps, string> = {
  skyTime: '天空时刻',
  lat: '纬度',
  lon: '经度',
  camYaw: '相机偏航',
  camPitch: '相机俯仰',
  planetScale: '行星倍率',
  magLimit: '星等上限',
};

/** 节目的默认(0 时刻之前)属性值 */
export function baseProps(show: Show, magLimitDefault: number): AnimProps {
  return {
    skyTime: show.sky.time,
    lat: show.sky.lat,
    lon: show.sky.lon,
    camYaw: show.camera.yaw,
    camPitch: show.camera.pitch,
    planetScale: 1,
    magLimit: magLimitDefault,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 平滑插值 (smoothstep) */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 求 time 时刻的动画属性。
 * 规则: 对每个属性, 取 time 之前最后一个含该属性的关键帧与之后第一个, 线性平滑插值;
 * 之前没有则取默认值, 之后没有则保持最后一个关键帧的值。
 */
export function sampleProps(show: Show, time: number, magLimitDefault: number): AnimProps {
  const base = baseProps(show, magLimitDefault);
  const kfs = [...show.keyframes].sort((a, b) => a.time - b.time);
  const result = { ...base };
  for (const key of ANIM_PROP_KEYS) {
    let prev: Keyframe | null = null;
    let next: Keyframe | null = null;
    for (const kf of kfs) {
      if (kf.props[key] === undefined) continue;
      if (kf.time <= time) prev = kf;
      if (kf.time > time) { next = kf; break; }
    }
    if (prev && next) {
      const t = smooth((time - prev.time) / (next.time - prev.time));
      result[key] = lerp(prev.props[key] as number, next.props[key] as number, t);
    } else if (prev) {
      result[key] = prev.props[key] as number;
    } else if (next) {
      result[key] = base[key]; // 首个关键帧之前保持默认
    }
  }
  return result;
}

let kfSeq = 0;
export function makeKeyframe(time: number, props: Partial<AnimProps>): Keyframe {
  return { id: `kf-${Date.now().toString(36)}-${(kfSeq++).toString(36)}`, time, props };
}
