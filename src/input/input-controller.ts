export type InputAction = "jump" | "pause";

export class InputController {
  private activePointerId: number | null = null;

  constructor(
    private readonly shell: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onAction: (action: InputAction) => void,
  ) {
    this.shell.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.releasePointer);
    this.canvas.addEventListener("pointercancel", this.releasePointer);
  }

  destroy(): void {
    this.shell.removeEventListener("keydown", this.handleKeyDown);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.releasePointer);
    this.canvas.removeEventListener("pointercancel", this.releasePointer);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
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

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || this.activePointerId !== null) {
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
