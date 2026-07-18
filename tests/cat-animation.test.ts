import { describe, expect, it } from "vitest";
import {
  CAT_ANIMATION_SPEC,
  LAND_ANIMATION_DURATION_MS,
  selectCatPose,
} from "../src/render/cat-animation";

describe("cat animation", () => {
  it("提供文档要求的核心帧数", () => {
    expect(CAT_ANIMATION_SPEC.idle.frames).toBe(4);
    expect(CAT_ANIMATION_SPEC.run.frames).toBe(6);
    expect(CAT_ANIMATION_SPEC.jumpUp.frames).toBe(2);
    expect(CAT_ANIMATION_SPEC.apex.frames).toBe(1);
    expect(CAT_ANIMATION_SPEC.fall.frames).toBe(2);
    expect(CAT_ANIMATION_SPEC.land.frames).toBe(3);
    expect(CAT_ANIMATION_SPEC.fail.frames).toBe(4);
  });

  it("按状态和垂直速度选择正确动作", () => {
    expect(selectCatPose("ready", true, 0, 0, null, false).animation).toBe("idle");
    expect(selectCatPose("playing", true, 0, 0, null, false).animation).toBe("run");
    expect(selectCatPose("playing", false, -200, 0, null, false).animation).toBe("jumpUp");
    expect(selectCatPose("playing", false, 0, 0, null, false).animation).toBe("apex");
    expect(selectCatPose("playing", false, 200, 0, null, false).animation).toBe("fall");
    expect(selectCatPose("gameOver", false, 400, 0, null, false).animation).toBe("fail");
  });

  it("落地动作只占用 132ms 且不会改变后续跑动", () => {
    const start = 1_000;
    expect(selectCatPose("playing", true, 0, start, start, false)).toMatchObject({
      animation: "land",
      frame: 0,
    });
    expect(selectCatPose("playing", true, 0, start + 50, start, false)).toMatchObject({
      animation: "land",
      frame: 1,
    });
    expect(selectCatPose("playing", true, 0, start + 100, start, false)).toMatchObject({
      animation: "land",
      frame: 2,
    });
    expect(
      selectCatPose("playing", true, 0, start + LAND_ANIMATION_DURATION_MS, start, false)
        .animation,
    ).toBe("run");
  });

  it("减少动态时冻结帧并跳过落地压缩", () => {
    const pose = selectCatPose("playing", true, 0, 1_050, 1_000, true);
    expect(pose.animation).toBe("run");
    expect(pose.frame).toBe(0);
    expect(pose.bob).toBe(0);
    expect(pose.squash).toBe(0);

    expect(selectCatPose("playing", false, -200, 4_000, null, true).frame).toBe(0);
    expect(selectCatPose("gameOver", false, 200, 4_000, null, true).frame).toBe(0);
  });
});
