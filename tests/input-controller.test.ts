import { describe, expect, it } from "vitest";
import { InputController, type InputAction } from "../src/input/input-controller";

class InputTarget extends EventTarget {
  readonly children = new Set<EventTarget>();
  contains(target: EventTarget | null): boolean {
    return target === this || (target !== null && this.children.has(target));
  }
  focus(): void {}
  setPointerCapture(): void {}
}

function setup() {
  const shell = new InputTarget();
  const canvas = new InputTarget();
  const button = new InputTarget();
  shell.children.add(canvas);
  shell.children.add(button);
  const actions: InputAction[] = [];
  const controller = new InputController(
    shell as unknown as HTMLElement,
    canvas as unknown as HTMLCanvasElement,
    (action) => actions.push(action),
  );
  return { shell, canvas, button, actions, controller };
}

function dispatch(target: EventTarget, type: string, properties: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(event, key, { value });
  }
  target.dispatchEvent(event);
  return event;
}

describe("InputController", () => {
  it("游戏区域响应跳跃和暂停，忽略重复按键", () => {
    const { shell, actions } = setup();
    for (const code of ["Space", "ArrowUp", "KeyW", "KeyP", "Escape"]) {
      expect(dispatch(shell, "keydown", { code }).defaultPrevented).toBe(true);
    }
    dispatch(shell, "keydown", { code: "Space", repeat: true });
    expect(actions).toEqual(["jump", "jump", "jump", "pause", "pause"]);
  });

  it("按钮冒泡的按键保持默认行为，不触发游戏动作", () => {
    const { shell, button, actions } = setup();
    for (const code of ["Space", "ArrowUp", "KeyW", "KeyP", "Escape"]) {
      expect(dispatch(shell, "keydown", { code, target: button }).defaultPrevented).toBe(false);
    }
    expect(actions).toEqual([]);
  });

  it("只处理主指针左键，取消或捕获丢失后能再次输入", () => {
    const { canvas, actions } = setup();
    const pointer = { isPrimary: true, button: 0, pointerId: 1 };
    for (const button of [1, 2]) {
      expect(dispatch(canvas, "pointerdown", { ...pointer, button }).defaultPrevented).toBe(false);
    }
    dispatch(canvas, "pointerdown", { ...pointer, isPrimary: false });
    dispatch(canvas, "pointerdown", pointer);
    dispatch(canvas, "pointerdown", { ...pointer, pointerId: 2 });
    dispatch(canvas, "pointercancel", { pointerId: 2 });
    dispatch(canvas, "pointerdown", pointer);
    expect(actions).toEqual(["jump"]);
    dispatch(canvas, "pointercancel", { pointerId: 1 });
    dispatch(canvas, "pointerdown", pointer);
    dispatch(canvas, "lostpointercapture", { pointerId: 1 });
    dispatch(canvas, "pointerdown", pointer);
    dispatch(canvas, "pointerup", { pointerId: 1 });
    dispatch(canvas, "lostpointercapture", { pointerId: 1 });
    expect(actions).toEqual(["jump", "jumpRelease", "jump", "jumpRelease", "jump", "jumpRelease"]);
  });

  it("松开所有跳跃键才发出松手动作，未经跳跃的按键不会松手", () => {
    const { shell, actions } = setup();
    dispatch(shell, "keyup", { code: "Space" });
    dispatch(shell, "keydown", { code: "Space" });
    dispatch(shell, "keydown", { code: "ArrowUp" });
    dispatch(shell, "keyup", { code: "Space" });
    expect(actions).toEqual(["jump", "jump"]);
    expect(dispatch(shell, "keyup", { code: "ArrowUp" }).defaultPrevented).toBe(true);
    dispatch(shell, "keyup", { code: "KeyP" });
    expect(actions).toEqual(["jump", "jump", "jumpRelease"]);
  });

  it("内部焦点移动不暂停，离开或失去焦点发出中断动作", () => {
    const { shell, button, actions } = setup();
    dispatch(shell, "focusout", { relatedTarget: button });
    expect(actions).toEqual([]);
    dispatch(shell, "focusout", { relatedTarget: new InputTarget() });
    dispatch(shell, "focusout", { relatedTarget: null });
    expect(actions).toEqual(["blur", "blur"]);
  });

  it("销毁后移除键盘、焦点及指针监听器", () => {
    const { shell, canvas, controller, actions } = setup();
    controller.destroy();
    dispatch(shell, "keydown", { code: "Space" });
    dispatch(shell, "focusout", { relatedTarget: null });
    dispatch(canvas, "pointerdown", { isPrimary: true, button: 0, pointerId: 1 });
    expect(actions).toEqual([]);
  });
});
