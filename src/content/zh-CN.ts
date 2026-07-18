import type { GameState } from "../game/types";

type OverlayState = Exclude<GameState, "playing">;

export const CONTENT = {
  overlay: {
    ready: {
      title: "赛博小猫跳楼顶",
      copy: "轻触画面或按空格，让小猫跃过楼顶间隙。",
      action: "开始跳跃",
    },
    paused: {
      title: "稍作休息",
      copy: "返回后需要手动继续，小猫会在原地等你。",
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
  result: (score: number, bestScore: number): string =>
    `本局 ${score} · 最高 ${bestScore}`,
} as const;
