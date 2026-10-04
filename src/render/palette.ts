export const PALETTE = {
  hazard: "#a24f45",
  reward: "#916b20",
  ink: "#26372e",
  night: "#f4f5f3",
  nightLift: "#e7eae6",
  violetDark: "#dce1dc",
  violet: "#cbd2cb",
  haze: "#809084",
  textCream: "#293b31",
  catCream: "#f9edd7",
  warmYellow: "#445d51",
  catOrange: "#986b38",
  roofOrange: "#50685a",
  windowAmber: "#9caa9b",
  scarfCoral: "#815b4e",
  neonCyan: "#7c958a",
  neonPink: "#a28b91",
  smoke: "#a8b3a9",
  blackPurple: "#293b31",
} as const;

export interface CatCoat {
  fur: string;
  cream: string;
  // HUD/marker colour with readable contrast on the light page.
  tag: string;
}

// Race slots 0–3: orange, grey, black and white cats. Slot 0 is the solo cat.
export const CAT_COATS: readonly CatCoat[] = [
  { fur: PALETTE.catOrange, cream: PALETTE.catCream, tag: "#8a5a22" },
  { fur: "#7d8782", cream: "#e9ece8", tag: "#55605a" },
  { fur: "#3f4844", cream: "#cfd5cf", tag: "#26302b" },
  { fur: "#ebe5d8", cream: "#fffaf0", tag: "#7a6a4b" },
];
