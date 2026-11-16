/** 数据模型 —— 节目 / 场景 / 关键帧 / 投影机 / 座位 / 全局设置 */

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

/** 可关键帧动画的属性 */
export interface AnimProps {
  /** 天空时刻 (Unix ms) */
  skyTime: number;
  /** 观测地纬度(度) */
  lat: number;
  /** 观测地经度(度, 东经为正) */
  lon: number;
  /** 预览相机朝向(度) */
  camYaw: number;
  camPitch: number;
  /** 行星尺寸倍率 */
  planetScale: number;
  /** 星等上限 */
  magLimit: number;
}

export interface Keyframe {
  id: string;
  /** 时间轴位置(秒) */
  time: number;
  props: Partial<AnimProps>;
}

export interface PlanetConfig {
  id: PlanetId;
  visible: boolean;
  showOrbit: boolean;
  showLabel: boolean;
  sizeBoost: number;
}

export interface Projector {
  id: string;
  name: string;
  enabled: boolean;
  /** 显示颜色(叠加显示用) */
  color: string;
  /** 在 domemaster 上的矩形区域(归一化 0..1, 中心 + 宽高) */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 边缘融合带宽度(像素, 以输出分辨率为基准) */
  blendPx: number;
  /** 融合伽马 */
  gamma: number;
  /** 亮度增益 */
  gain: number;
}

export interface SeatConfig {
  rows: number;
  seatsPerRow: number;
  /** 首排距球心水平距离(米) */
  firstRowDist: number;
  /** 排距(米) */
  rowSpacing: number;
  /** 座位间距(米) */
  seatSpacing: number;
  /** 眼高(米) */
  eyeHeight: number;
  /** 球幕半径(米) */
  domeRadius: number;
}

export interface DomeConfig {
  /** 视场角: 180 或 210 */
  fovDeg: number;
  /** 球幕倾角(度) */
  tiltDeg: number;
  /** 输出分辨率(边长) */
  resolution: number;
}

export interface Show {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 节目时长(秒) */
  duration: number;
  fps: number;
  dome: DomeConfig;
  sky: { time: number; lat: number; lon: number };
  camera: { yaw: number; pitch: number };
  planets: PlanetConfig[];
  keyframes: Keyframe[];
  projectors: Projector[];
  seats: SeatConfig;
  /** 是否显示太阳/月亮 */
  showSun: boolean;
  showMoon: boolean;
  /** 是否显示地平网格(校正测试图) */
  showGrid: boolean;
}

export interface AppSettings {
  magLimit: number;
  starExposure: number;
  cubeSize: number;
  /** 自检采样步长 */
  selfTestStep: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  magLimit: 4.5,
  starExposure: 1.0,
  cubeSize: 1024,
  selfTestStep: 7,
};

export const PROJECTOR_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8'];

export function defaultPlanets(): PlanetConfig[] {
  return (['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as PlanetId[]).map((id) => ({
    id, visible: true, showOrbit: false, showLabel: true, sizeBoost: 1,
  }));
}

export function defaultProjectors(): Projector[] {
  // 默认四分区: 上下左右各一台, 重叠 10%
  const mk = (i: number, name: string, cx: number, cy: number): Projector => ({
    id: `pj-${i}`, name, enabled: true, color: PROJECTOR_COLORS[i % PROJECTOR_COLORS.length],
    cx, cy, w: 0.6, h: 0.6, blendPx: 128, gamma: 2.2, gain: 1,
  });
  return [mk(0, '投影机 1 (北)', 0.5, 0.25), mk(1, '投影机 2 (东)', 0.75, 0.5),
          mk(2, '投影机 3 (南)', 0.5, 0.75), mk(3, '投影机 4 (西)', 0.25, 0.5)];
}

export function createShow(name: string): Show {
  const now = Date.now();
  return {
    id: `show-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    createdAt: now,
    updatedAt: now,
    duration: 60,
    fps: 30,
    dome: { fovDeg: 180, tiltDeg: 15, resolution: 2048 },
    sky: { time: now, lat: 39.9, lon: 116.4 },
    camera: { yaw: 0, pitch: 0 },
    planets: defaultPlanets(),
    keyframes: [],
    projectors: defaultProjectors(),
    seats: {
      rows: 8, seatsPerRow: 12, firstRowDist: 2, rowSpacing: 0.9,
      seatSpacing: 0.6, eyeHeight: 1.2, domeRadius: 8,
    },
    showSun: true,
    showMoon: true,
    showGrid: false,
  };
}
