export type InputAction = "jump" | "pause" | "blur";

export class InputController {
  private activePointerId: number | null = null;

  constructor(
    private readonly shell: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onAction: (action: InputAction) => void,
  ) {
    this.shell.addEventListener("keydown", this.handleKeyDown);
    this.shell.addEventListener("focusout", this.handleFocusOut);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.releasePointer);
    this.canvas.addEventListener("pointercancel", this.releasePointer);
    this.canvas.addEventListener("lostpointercapture", this.releasePointer);
  }

  destroy(): void {
    this.shell.removeEventListener("keydown", this.handleKeyDown);
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

    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
      event.preventDefault();
      this.onAction("jump");
      return;
    }

    if (event.code === "Escape" || event.code === "KeyP") {
      event.preventDefault();
      this.onAction("pause");
    }
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (!this.shell.contains(event.relatedTarget as Node | null)) {
      this.activePointerId = null;
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
  };
}
