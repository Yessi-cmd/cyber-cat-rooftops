import { descendingFlightTime } from "../../src/game/platform-generator";
import type { WorldSnapshot } from "../../src/game/types";

// Independent test player: jump before a visible barrier, then aim for the next roof.
export function shouldJump(snapshot: WorldSnapshot): boolean {
  const { cat, platforms } = snapshot;
  if (!cat.grounded || cat.platformId === null) return false;
  const current = platforms.find((platform) => platform.id === cat.platformId);
  const next = platforms.find((platform) => platform.id === cat.platformId! + 1);
  if (!current || !next) return false;
  if (current.hazard && cat.x < current.hazard.x + current.hazard.width) {
    return cat.x >= current.hazard.x - cat.width - cat.vx * 0.11;
  }
  const flightTime = descendingFlightTime(next.y - current.y);
  return flightTime !== null && cat.x >= next.x - cat.width + 8 - cat.vx * flightTime;
}
