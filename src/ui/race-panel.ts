import { CONTENT } from "../content/zh-CN";
import type { RaceView } from "../net/race-controller";
import { CAT_COATS } from "../render/palette";
import type { RacePlayer } from "../../shared/race-protocol.js";

export type RacePrimaryAction = "start" | "solo" | null;

export interface RaceOverlayElements {
  title: HTMLElement;
  copy: HTMLElement;
  result: HTMLElement;
  players: HTMLOListElement;
  invite: HTMLElement;
  link: HTMLInputElement;
  primary: HTMLButtonElement;
  secondary: HTMLButtonElement;
}

export interface RaceOverlayContext {
  localScore: number;
  countdownMs: number | null;
  inviteUrl: string | null;
}

const RACE = CONTENT.race;

function catName(slot: number): string {
  return RACE.catNames[slot] ?? RACE.catNames[0];
}

function playerRow(
  slot: number,
  you: boolean,
  tags: readonly string[],
  score: number | null,
): HTMLLIElement {
  const row = document.createElement("li");
  row.dataset.you = String(you);
  const swatch = document.createElement("span");
  swatch.className = "race-swatch";
  swatch.style.background = CAT_COATS[slot]?.fur ?? CAT_COATS[0]!.fur;
  const name = document.createElement("span");
  name.textContent = catName(slot) + (you ? RACE.you : "");
  row.append(swatch, name);
  for (const tag of tags) {
    const label = document.createElement("span");
    label.className = "race-tag";
    label.textContent = tag;
    row.append(label);
  }
  if (score !== null) {
    const value = document.createElement("span");
    value.className = "race-score";
    value.textContent = String(score);
    row.append(value);
  }
  return row;
}

function playerTags(view: Readonly<RaceView>, player: RacePlayer): string[] {
  const tags: string[] = [];
  if (player.slot === view.host) tags.push(RACE.hostTag);
  if (!player.inRace && (view.phase === "countdown" || view.phase === "racing")) tags.push(RACE.waitingTag);
  if (player.inRace && player.finished && view.phase === "racing") tags.push(RACE.outTag);
  return tags;
}

// Renders the overlay for race mode and returns what the primary button does.
export function renderRaceOverlay(
  elements: RaceOverlayElements,
  view: Readonly<RaceView>,
  context: RaceOverlayContext,
): RacePrimaryAction {
  const { title, copy, result, players, invite, link, primary, secondary } = elements;
  result.hidden = true;
  invite.hidden = true;
  players.hidden = true;
  players.replaceChildren();
  primary.hidden = false;
  primary.disabled = false;
  secondary.hidden = false;
  secondary.textContent = RACE.leave;

  if (view.error !== null && (view.error === "disconnected" || view.room === null)) {
    title.textContent = view.error === "disconnected" ? RACE.errors.disconnected : RACE.errors[view.error];
    copy.textContent = "";
    primary.textContent = RACE.backToSolo;
    secondary.hidden = true;
    return "solo";
  }
  if (view.room === null) {
    title.textContent = RACE.connecting;
    copy.textContent = "";
    primary.hidden = true;
    secondary.hidden = true;
    return null;
  }

  const listPlayers = (withScores: boolean): void => {
    players.hidden = false;
    for (const player of view.players) {
      players.append(playerRow(player.slot, player.slot === view.you, playerTags(view, player),
        withScores && player.inRace ? player.score : null));
    }
  };
  const isHost = view.you === view.host;
  const me = view.players.find(player => player.slot === view.you);

  switch (view.phase) {
    case "lobby":
      title.textContent = RACE.lobbyTitle(view.room);
      copy.textContent = view.error === null ? RACE.lobbyCopy : RACE.errors[view.error];
      listPlayers(false);
      if (context.inviteUrl !== null) {
        invite.hidden = false;
        link.value = context.inviteUrl;
      }
      primary.textContent = isHost ? RACE.start : RACE.waitHost;
      primary.disabled = !isHost;
      return isHost ? "start" : null;
    case "countdown":
      title.textContent = String(Math.max(1, Math.ceil((context.countdownMs ?? 0) / 1000)));
      copy.textContent = RACE.countdownCopy;
      listPlayers(false);
      primary.hidden = true;
      secondary.hidden = true;
      return null;
    case "racing":
      if (me?.inRace) {
        title.textContent = RACE.waitingTitle;
        copy.textContent = RACE.waitingCopy(context.localScore);
      } else {
        title.textContent = RACE.spectatingTitle;
        copy.textContent = RACE.spectatingCopy;
      }
      listPlayers(true);
      primary.hidden = true;
      return null;
    case "results": {
      const ranking = view.ranking ?? [];
      const rank = ranking.findIndex(entry => entry.slot === view.you) + 1;
      title.textContent = rank > 0 ? RACE.resultsTitle(rank) : RACE.resultsSpectatorTitle;
      copy.textContent = RACE.resultsCopy;
      players.hidden = false;
      for (const entry of ranking) {
        players.append(playerRow(entry.slot, entry.slot === view.you, [`#${ranking.indexOf(entry) + 1}`], entry.score));
      }
      primary.textContent = isHost ? RACE.rematch : RACE.waitRematch;
      primary.disabled = !isHost;
      return isHost ? "start" : null;
    }
  }
}

export interface BoardEntry {
  slot: number;
  score: number;
  out: boolean;
}

// Compact live ranking while racing; returns a key so callers skip no-op updates.
export function renderRaceBoard(board: HTMLOListElement, entries: BoardEntry[], you: number, previousKey: string): string {
  entries.sort((a, b) => b.score - a.score || a.slot - b.slot);
  const key = entries.map(entry => `${entry.slot}:${entry.score}:${entry.out}`).join("|");
  if (key === previousKey) return key;
  board.replaceChildren();
  for (const entry of entries) {
    const row = document.createElement("li");
    row.dataset.you = String(entry.slot === you);
    row.dataset.out = String(entry.out);
    const swatch = document.createElement("span");
    swatch.className = "race-swatch";
    swatch.style.background = CAT_COATS[entry.slot]?.fur ?? CAT_COATS[0]!.fur;
    const label = document.createElement("span");
    label.textContent = `${catName(entry.slot)} ${entry.score}`;
    row.append(swatch, label);
    board.append(row);
  }
  return key;
}
