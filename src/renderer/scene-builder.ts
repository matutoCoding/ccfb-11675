// 每帧场景组装：星表→方向点云、行星轨道位置、关键帧叠加、银河带

import {
  Planet,
  SceneConfig,
  ObserverConfig,
  Settings,
} from '../types';
import {
  equatorialToHorizon,
  planetHorizonDirection,
  sunHorizonDirection,
} from '../math/astro';
import {
  selectStars,
  magnitudeToBrightness,
  magnitudeToSize,
  starColorForMag,
  galacticToEquatorial,
} from '../math/star-catalog';
import { sampleVec3, sampleScalar, sampleChannel } from '../math/keyframes';
import {
  Vec3,
  v3,
  normalize,
  deg2rad,
  lerp,
  add,
  scale,
  fromHoriz,
} from '../math/vec3';
import { Seat } from '../types';

export interface StarInstance {
  dir: Vec3;
  size: number;
  brightness: number;
  color: Vec3;
}

export interface PlanetInstance {
  id: string;
  name: string;
  /** 场景单位位置（太阳在原点的太阳系模型坐标，用于 cubemap 内渲染） */
  position: Vec3;
  radius: number;
  color: Vec3;
  opacity: number;
  orbitPoints: Vec3[] | null;
  emissive: number;
}

export interface RenderScene {
  stars: StarInstance[];
  planets: PlanetInstance[];
  sunDir: Vec3;
  showSun: boolean;
  sunColor: Vec3;
  milkyWay: StarInstance[];
  /** 时间戳（秒，场景内时间） */
  sceneTime: number;
}

const PLANET_NAMES = [
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
];

/** 自动公转：简化为在场景水平面（XY）上匀速圆周，周期取轨道参数 */
const autoOrbitPosition = (p: Planet, days: number): Vec3 => {
  const phase = deg2rad(p.initialPhaseDeg);
  const ang = phase + (days / Math.max(p.periodDays, 0.1)) * Math.PI * 2;
  return v3(
    Math.cos(ang) * p.orbitRadius,
    Math.sin(ang) * p.orbitRadius,
    0,
  );
};

const orbitLinePoints = (p: Planet, segments = 96): Vec3[] => {
  const pts: Vec3[] = [];
  const phase = deg2rad(p.initialPhaseDeg);
  for (let i = 0; i <= segments; i++) {
    const ang = phase + (i / segments) * Math.PI * 2;
    pts.push(
      v3(
        Math.cos(ang) * p.orbitRadius,
        Math.sin(ang) * p.orbitRadius,
        0,
      ),
    );
  }
  return pts;
};

/** 组装一帧的渲染场景。
 * @param sceneTime 场景内时间（秒）
 * @param absDate 当前 UTC（星空/行星真实位置用）
 */
export const buildScene = (
  scene: SceneConfig,
  observer: ObserverConfig,
  _settings: Settings,
  sceneTime: number,
  absDate: Date,
): RenderScene => {
  // 1) 星表星 → 站心水平方向
  const catalog = selectStars(scene.magnitudeLimit);
  const stars: StarInstance[] = catalog.map((s) => {
    const dir = equatorialToHorizon(s, observer, absDate);
    return {
      dir,
      size: magnitudeToSize(s.mag),
      brightness: magnitudeToBrightness(s.mag, scene.starGain),
      color: starColorForMag(s.mag),
    };
  });

  // 2) 银河带：银道面 ±10° 内采样一圈弱光颗粒
  const milkyWay: StarInstance[] = [];
  if (scene.showMilkyWay) {
    for (let l = 0; l < 360; l += 3) {
      for (const b of [-8, -4, 0, 4, 8]) {
        const eq = galacticToEquatorial(l, b);
        const dir = equatorialToHorizon(eq, observer, absDate);
        const band = 1 - Math.abs(b) / 10;
        milkyWay.push({
          dir,
          size: 1.6,
          brightness: 0.05 + 0.12 * band * band,
          color: v3(0.75, 0.78, 0.95),
        });
      }
    }
  }

  // 3) 太阳方向（真实天文）
  const sunDir = sunHorizonDirection(observer, absDate);

  // 4) 行星：自动公转的场景模型 + 关键帧叠加
  const days = sceneTime / 86400;
  const planetInstances: PlanetInstance[] = scene.planets.map((p, idx) => {
    const base = p.autoOrbit
      ? autoOrbitPosition(p, days)
      : scale(fromHoriz(deg2rad(p.initialPhaseDeg), 0), p.orbitRadius);

    // 关键帧：position 偏移、scale 改半径、color/opacity 覆盖
    const offset = sampleVec3(p.keyframes, 'position', sceneTime, v3(0, 0, 0));
    const scaleKf = sampleVec3(p.keyframes, 'scale', sceneTime, v3(1, 1, 1));
    const colorArr = sampleChannel(
      p.keyframes,
      'color',
      sceneTime,
      [p.color[0], p.color[1], p.color[2]],
    );
    const opacity = sampleScalar(p.keyframes, 'opacity', sceneTime, 1);

    const position = add(base, offset);
    const radius = p.radius * Math.max(0.05, (scaleKf.x + scaleKf.y + scaleKf.z) / 3);
    const color = v3(colorArr[0], colorArr[1], colorArr[2]);

    return {
      id: p.id,
      name: p.name,
      position,
      radius,
      color,
      opacity: Math.min(1, Math.max(0, opacity)),
      orbitPoints: p.showOrbit ? orbitLinePoints(p) : null,
      emissive: idx === 1 ? 0.35 : 0.0, // 金星稍发光，便于辨识
    };
  });

  return {
    stars,
    planets: planetInstances,
    sunDir,
    showSun: scene.showSun,
    sunColor: v3(scene.sunColor[0], scene.sunColor[1], scene.sunColor[2]),
    milkyWay,
    sceneTime,
  };
};

/** 真实行星方向（用于信息叠加/辅助标注，不参与场景模型） */
export const realPlanetDirections = (
  observer: ObserverConfig,
  date: Date,
): Array<{ name: string; dir: Vec3 }> =>
  PLANET_NAMES.map((name) => ({
    name,
    dir: planetHorizonDirection(name, observer, date),
  }));

/** 座位眼睛的场景坐标（米→渲染单位按球幕半径归一） */
export const seatEyeNormalized = (seat: Seat, _settings: Settings): Vec3 =>
  normalize(v3(seat.x, seat.y, seat.z)); // 方向即可，warp 中按半径还原

export { lerp };
