import type { LifeSession } from "./domain";

// Called once for new games only; restored sessions never pass through here.
export function initialOrientation(session: LifeSession, stacked: boolean): LifeSession {
  return { ...session, players: session.players.map((player, index) => ({
    ...player,
    rotated: session.players.length === 4 ? index < 2 : session.players.length === 2 && stacked && index === 0,
  })) };
}

export function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function iphoneSafari() {
  return /iPhone/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
}
