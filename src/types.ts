// 全局数据模型 —— 节目工程的所有持久化结构

export type Vec3Tuple = [number, number, number];

/** 等距鱼眼视场角类型：180° 半球 / 210° 扩展半球 */
export type DomeFov = 180 | 210;

/** 关键帧支持的动画属性 */
export type AnimChannel =
  | 'position'
  | 'scale'
  | 'color'
  | 'opacity';

export interface Keyframe {
  id: string;
  /** 时间（秒） */
  t: number;
  channel: AnimChannel;
  /** position/scale 为三维；color 为 [r,g,b]；opacity 为 [a] */
  value: number[];
  /** 插值方式 */
  easing: 'linear' | 'easeInOut' | 'hold';
}

export interface Planet {
  id: string;
  name: string;
  /** 轨道半径（场景单位，1 = 地球轨道半径） */
  orbitRadius: number;
  /** 公转周期（天） */
  periodDays: number;
  /** 初始平近点角（度） */
  initialPhaseDeg: number;
  /** 行星半径（渲染单位） */
  radius: number;
  color: Vec3Tuple;
  /** 是否显示轨道线 */
  showOrbit: boolean;
  /** 是否自动公转（关闭后只按关键帧/初始相位） */
  autoOrbit: boolean;
  /** 用户关键帧（相对自动轨道位置的叠加/覆盖动画） */
  keyframes: Keyframe[];
}

export interface SceneConfig {
  id: string;
  name: string;
  /** 场景时长（秒） */
  durationSec: number;
  planets: Planet[];
  /** 是否显示太阳 */
  showSun: boolean;
  sunColor: Vec3Tuple;
  /** 是否显示背景银河带 */
  showMilkyWay: boolean;
  /** 星等上限（只画亮于此星等的星） */
  magnitudeLimit: number;
  /** 星点整体亮度增益 */
  starGain: number;
}

/** 观测地点与时间 */
export interface ObserverConfig {
  /** 纬度（度，北纬为正） */
  latitudeDeg: number;
  /** 经度（度，东经为正） */
  longitudeDeg: number;
  /** UTC 日期时间 ISO 字符串 */
  utcIso: string;
  /** 时间流速倍率（预览动画用，1 = 实时） */
  timeRate: number;
}

/** 单台投影机的分区与融合参数 */
export interface Projector {
  id: string;
  name: string;
  enabled: boolean;
  /** 分区中心方位角（度，北=0，顺时针） */
  azimuthDeg: number;
  /** 分区中心高度角（度） */
  elevationDeg: number;
  /** 水平覆盖角（度） */
  widthDeg: number;
  /** 垂直覆盖角（度） */
  heightDeg: number;
  /** 边缘融合带宽度（度） */
  blendWidthDeg: number;
  /** 伽马（融合亮度过渡） */
  blendGamma: number;
  /** 旋转（度，画面滚转） */
  rollDeg: number;
}

/** 座位 */
export interface Seat {
  id: string;
  name: string;
  /** 相对球心的平面坐标（米），x 东、y 北 */
  x: number;
  y: number;
  /** 相对球心的高度（米，通常为负，座位低于球心） */
  z: number;
}

export interface Settings {
  /** 球幕直径（米） */
  domeDiameterM: number;
  /** 球幕倾角（度，0 = 正轴水平天幕；>0 向一侧倾斜） */
  domeTiltDeg: number;
  /** 倾斜轴方位角（度） */
  domeTiltAzimuthDeg: number;
  fov: DomeFov;
  /** 内部预览分辨率（立方体面边长 / 鱼眼输出边长） */
  previewResolution: number;
  /** 导出默认分辨率（鱼眼图边长） */
  exportResolution: number;
  /** 渲染帧率 */
  fps: number;
}

export interface ShowProject {
  /** 工程文件版本号，便于以后迁移 */
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: Settings;
  observer: ObserverConfig;
  scenes: SceneConfig[];
  projectors: Projector[];
  seats: Seat[];
  /** 当前选中的场景 id */
  activeSceneId: string;
}

/** 帧导出任务配置 */
export interface ExportJob {
  startFrame: number;
  endFrame: number;
  resolution: number;
  /** 输出文件名前缀 */
  prefix: string;
}

export interface ExportProgress {
  frame: number;
  total: number;
  cancelled: boolean;
  done: boolean;
}
