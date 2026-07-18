export type UiIconName = "soundOn" | "soundOff" | "pause";

interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const UI_ICON_RECTS: Readonly<Record<UiIconName, readonly PixelRect[]>> = {
  soundOn: [
    { x: 3, y: 9, width: 4, height: 6 },
    { x: 7, y: 6, width: 3, height: 12 },
    { x: 13, y: 8, width: 2, height: 2 },
    { x: 15, y: 10, width: 2, height: 4 },
    { x: 13, y: 14, width: 2, height: 2 },
    { x: 19, y: 6, width: 2, height: 12 },
  ],
  soundOff: [
    { x: 3, y: 9, width: 4, height: 6 },
    { x: 7, y: 6, width: 3, height: 12 },
    { x: 13, y: 7, width: 2, height: 2 },
    { x: 15, y: 9, width: 2, height: 2 },
    { x: 17, y: 11, width: 2, height: 2 },
    { x: 19, y: 13, width: 2, height: 2 },
    { x: 13, y: 15, width: 2, height: 2 },
    { x: 15, y: 13, width: 2, height: 2 },
    { x: 17, y: 9, width: 2, height: 2 },
    { x: 19, y: 7, width: 2, height: 2 },
  ],
  pause: [
    { x: 5, y: 4, width: 5, height: 16 },
    { x: 14, y: 4, width: 5, height: 16 },
  ],
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function renderUiIcon(target: HTMLElement, iconName: UiIconName): void {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("pixel-icon");

  for (const pixel of UI_ICON_RECTS[iconName]) {
    const rect = document.createElementNS(SVG_NAMESPACE, "rect");
    rect.setAttribute("x", pixel.x.toString());
    rect.setAttribute("y", pixel.y.toString());
    rect.setAttribute("width", pixel.width.toString());
    rect.setAttribute("height", pixel.height.toString());
    svg.append(rect);
  }

  target.replaceChildren(svg);
}
