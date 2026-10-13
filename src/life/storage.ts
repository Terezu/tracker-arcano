import { createSession, integer, palette } from "./domain.ts";
import type { Change, Commander, LifeEvent, LifeSession, Player } from "./domain.ts";
export const sessionKey = "tracker-arcano.life.v1";
interface LocalStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(value) && !(value in Object.prototype);
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 80;
const number = (value: unknown, minimum = Number.MIN_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
const fail = (): never => { throw new Error("Sessão local inválida ou de versão incompatível. Seus dados não foram apagados."); };
const same = (a: unknown, b: unknown) => {
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  return canonical(a) === canonical(b);
};

export function decodeSession(raw: string): LifeSession {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail(); }
  if (!object(value) || value.schema !== 1 || !identifier(value.id) || ![20, 30, 40].includes(value.initialLife as number) || !number(value.poisonLimit, 1) || !Array.isArray(value.players) || ![2,3,4].includes(value.players.length) || typeof value.ended !== "boolean" || typeof value.commanderEnabled !== "boolean" || typeof value.deckId !== "string" || value.deckId.length > 128) return fail();
  const players: Player[] = value.players.map((p, i) => {
    if (!object(p) || p.id !== `p${i + 1}` || !name(p.name) || !palette.some(c => c[1] === p.color) || !number(p.life) || !number(p.poison, 0) || typeof p.rotated !== "boolean") return fail();
    return { id: p.id as string, name: p.name, color: p.color as string, life: p.life, poison: p.poison, rotated: p.rotated };
  });
  const validPlayer = (id: unknown): id is string => players.some(p => p.id === id);
  if (new Set(players.map(p => p.color)).size !== players.length || !Array.isArray(value.commanders) || !object(value.damage) || !Array.isArray(value.history) || !Array.isArray(value.undo)) return fail();
  const commanders: Commander[] = value.commanders.map(c => {
    if (!object(c) || !identifier(c.id) || !name(c.name) || !validPlayer(c.ownerId) || !validPlayer(c.controllerId)) return fail();
    return { id: c.id, name: c.name, ownerId: c.ownerId, controllerId: c.controllerId };
  });
  if (new Set(commanders.map(c => c.id)).size !== commanders.length) return fail();
  const damage: LifeSession["damage"] = {};
  for (const p of players) {
    const row = value.damage[p.id];
    if (!object(row)) return fail();
    damage[p.id] = {};
    for (const [id, amount] of Object.entries(row)) {
      if (!commanders.some(c => c.id === id) || !number(amount, 0)) return fail();
      damage[p.id][id] = amount;
    }
  }
  const history: LifeEvent[] = value.history.map(e => {
    if (!object(e) || !identifier(e.id) || !validPlayer(e.playerId) || !["life","poison","combat","correction","undo"].includes(e.type as string) || typeof e.at !== "string" || !Number.isFinite(Date.parse(e.at)) || !Array.isArray(e.changes) || ![1,2].includes(e.changes.length) || (e.source !== undefined && !name(e.source)) || (e.undoOf !== undefined && !identifier(e.undoOf))) return fail();
    const changes: Change[] = e.changes.map(c => {
      if (!object(c) || c.playerId !== e.playerId || !["life","poison","damage"].includes(c.field as string) || !number(c.before, c.field === "life" ? Number.MIN_SAFE_INTEGER : 0) || !number(c.after, c.field === "life" ? Number.MIN_SAFE_INTEGER : 0) || (c.field === "damage" && !commanders.some(cmd => cmd.id === c.commanderId))) return fail();
      return { playerId: c.playerId as string, field: c.field as Change["field"], before: c.before, after: c.after, ...(c.field === "damage" ? { commanderId: c.commanderId as string } : {}) };
    });
    if (e.type === "combat" && (changes.length !== 2 || changes[0].field !== "damage" || changes[1].field !== "life" || changes[0].after <= changes[0].before || changes[0].after - changes[0].before !== changes[1].before - changes[1].after)) return fail();
    if (e.type !== "undo" && e.type !== "combat" && (changes.length !== 1 || changes[0].field !== (e.type === "correction" ? "damage" : e.type))) return fail();
    return { id: e.id, type: e.type as LifeEvent["type"], at: e.at, playerId: e.playerId as string, changes, ...(e.source ? { source: e.source as string } : {}), ...(e.undoOf ? { undoOf: e.undoOf as string } : {}) };
  });
  if (new Set(history.map(e => e.id)).size !== history.length) return fail();
  const replay = createSession({ initialLife: value.initialLife as number, poisonLimit: value.poisonLimit, players, deckId: value.deckId }, value.id);
  const undo: LifeEvent[] = [];
  for (const event of history) {
    if (event.type === "undo") {
      const last = undo.pop();
      if (!last || event.undoOf !== last.id || !same(event.changes, last.changes.map(c => ({ ...c, before: c.after, after: c.before })))) return fail();
    } else undo.push(event);
    for (const change of event.changes) {
      const p = replay.players.find(p => p.id === change.playerId)!;
      const current = change.field === "damage" ? replay.damage[p.id][change.commanderId!] || 0 : p[change.field];
      if (current !== change.before) return fail();
      if (change.field === "damage") replay.damage[p.id][change.commanderId!] = integer(change.after, 0);
      else p[change.field] = change.after;
    }
  }
  if (!same(value.undo, undo)) return fail();
  for (const p of players) {
    const restored = replay.players.find(r => r.id === p.id)!;
    if (p.life !== restored.life || p.poison !== restored.poison) return fail();
    for (const c of commanders) if ((damage[p.id][c.id] || 0) !== (replay.damage[p.id][c.id] || 0)) return fail();
  }
  return { schema: 1, id: value.id, initialLife: value.initialLife as 20 | 30 | 40, poisonLimit: value.poisonLimit, players, commanders, damage, history, undo, deckId: value.deckId, commanderEnabled: value.commanderEnabled, ended: value.ended };
}
export function readSession(store: LocalStore = localStorage) {
  const raw = store.getItem(sessionKey);
  return raw ? decodeSession(raw) : null;
}
export function saveSession(session: LifeSession, store: LocalStore = localStorage) {
  store.setItem(sessionKey, JSON.stringify(session));
}
export function clearSession(store: LocalStore = localStorage) { store.removeItem(sessionKey); }
