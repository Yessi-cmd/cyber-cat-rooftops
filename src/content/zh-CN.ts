import type { GameState } from "../game/types";

type OverlayState = Exclude<GameState, "playing">;

export const CONTENT = {
  document: {
    category: "个人工作区 / 随记",
    tag: "仅本地",
    kicker: "DAILY NOTES",
    title: "今日随记",
    intro: "留一点空白，换个思路。",
    section: "01 / 片刻小憩",
    hint: "随时暂停",
    footer: "不必赶进度，准备好了再继续。",
    brand: "BREAK TIME",
  },
  overlay: {
    ready: {
      title: "赛博小猫跳楼顶",
      copy: "轻触或空格起跳，空中再按一次二段跳；近楼单跳、远楼二段跳；留意路障预警。",
      action: "开始跳跃",
    },
    paused: {
      title: "稍作休息",
      copy: "小猫在原地等你，准备好后点「继续游戏」。",
      action: "继续游戏",
    },
    gameOver: {
      title: "差一点就到了",
      copy: "记住节奏，再试一次。",
      action: "再来一局",
    },
  } satisfies Record<OverlayState, { title: string; copy: string; action: string }>,
  aria: {
    pause: "暂停游戏",
    mute: "静音",
    unmute: "开启声音",
  },
  live: {
    started: "游戏开始",
    resumed: "继续游戏",
    paused: "游戏已暂停",
    restarted: "新一局开始",
    muted: "声音已关闭",
    unmuted: "声音已开启",
    gameOver: (score: number): string => `游戏结束，本局 ${score} 分`,
  },
  jumps: (count: number): string => `可跳 ${count}/2`,
  controls: "空格 / ↑ / W 跳跃 · 空中再按二段跳 · P / Esc 暂停",
  loot: (count: number): string => `鱼干 × ${count}`,
  hazardWarning: "前方路障即将升起！",
  hazardFailure: "碰到路障了。提前起跳，越过条纹挡板。",
  result: (score: number, bestScore: number): string =>
    `本局 ${score} · 最高 ${bestScore}`,
} as const;
