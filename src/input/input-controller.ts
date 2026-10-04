export type InputAction = "jump" | "jumpRelease" | "pause" | "blur";

const JUMP_CODES = new Set(["Space", "ArrowUp", "KeyW"]);

export class InputController {
  private activePointerId: number | null = null;
  private readonly heldJumpKeys = new Set<string>();

  constructor(
    private readonly shell: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onAction: (action: InputAction) => void,
  ) {
    this.shell.addEventListener("keydown", this.handleKeyDown);
    this.shell.addEventListener("keyup", this.handleKeyUp);
    this.shell.addEventListener("focusout", this.handleFocusOut);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.releasePointer);
    this.canvas.addEventListener("pointercancel", this.releasePointer);
    this.canvas.addEventListener("lostpointercapture", this.releasePointer);
  }

  destroy(): void {
    this.shell.removeEventListener("keydown", this.handleKeyDown);
    this.shell.removeEventListener("keyup", this.handleKeyUp);
    this.shell.removeEventListener("focusout", this.handleFocusOut);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.releasePointer);
    this.canvas.removeEventListener("pointercancel", this.releasePointer);
    this.canvas.removeEventListener("lostpointercapture", this.releasePointer);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.repeat || event.defaultPrevented ||
      (event.target !== this.shell && event.target !== this.canvas)
    ) {
      return;
    }

    if (JUMP_CODES.has(event.code)) {
      event.preventDefault();
      this.heldJumpKeys.add(event.code);
      this.onAction("jump");
      return;
    }

    if (event.code === "Escape" || event.code === "KeyP") {
      event.preventDefault();
      this.onAction("pause");
    }
  };

  // Only keys whose press became a jump can release it; the jump stays short
  // until every held jump key is up.
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!this.heldJumpKeys.delete(event.code)) return;
    event.preventDefault();
    if (this.heldJumpKeys.size === 0) this.onAction("jumpRelease");
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (!this.shell.contains(event.relatedTarget as Node | null)) {
      this.activePointerId = null;
      this.heldJumpKeys.clear();
      this.onAction("blur");
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0 || this.activePointerId !== null) {
      return;
    }

    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.shell.focus({ preventScroll: true });
    this.onAction("jump");
  };

  private readonly releasePointer = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.activePointerId = null;
    this.onAction("jumpRelease");
  };
}
