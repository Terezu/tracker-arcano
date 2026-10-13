export const palette = [
  ["Azul-marinho", "#142B4B"], ["Vermelho", "#A52C42"],
  ["Verde", "#236B4C"], ["Roxo", "#7543A2"],
  ["Laranja", "#B95D19"], ["Amarelo", "#E0B832"],
  ["Ciano", "#087E92"], ["Rosa", "#B83C85"],
  ["Marrom", "#795039"], ["Cinza", "#626B78"],
] as const;
export interface Player { id: string; name: string; color: string; life: number; poison: number; rotated: boolean }
export interface Commander { id: string; name: string; ownerId: string; controllerId: string }
export interface Change { playerId: string; field: "life" | "poison" | "damage"; commanderId?: string; before: number; after: number }
export interface LifeEvent { id: string; type: "life" | "poison" | "combat" | "correction" | "undo"; at: string; playerId: string; source?: string; changes: Change[]; undoOf?: string }
export interface LifeSession {
  schema: 1; id: string; initialLife: 20 | 30 | 40; poisonLimit: number;
  players: Player[]; commanders: Commander[]; damage: Record<string, Record<string, number>>;
  commanderEnabled: boolean; history: LifeEvent[]; undo: LifeEvent[]; ended: boolean; deckId: string;
}
export function integer(value: number, minimum = Number.MIN_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error("Informe um número inteiro válido.");
  return value;
}
export function createSession(config: { initialLife: number; poisonLimit: number; players: { name: string; color: string }[]; deckId?: string }, id: string): LifeSession {
  if (![20, 30, 40].includes(config.initialLife) || ![2, 3, 4].includes(config.players.length)) throw new Error("Escolha 2, 3 ou 4 jogadores e 20, 30 ou 40 vidas.");
  integer(config.poisonLimit, 1);
  const colors = new Set(config.players.map(p => p.color));
  if (colors.size !== config.players.length || [...colors].some(c => !palette.some(p => p[1] === c))) throw new Error("Escolha cores diferentes da paleta para cada jogador.");
  const players = config.players.map((p, i) => {
    const name = p.name.trim() || `Jogador ${i + 1}`;
    if (name.length > 80) throw new Error("Nomes devem ter até 80 caracteres.");
    return { id: `p${i + 1}`, name, color: p.color, life: config.initialLife, poison: 0, rotated: false };
  });
  return { schema: 1, id, initialLife: config.initialLife as 20 | 30 | 40, poisonLimit: config.poisonLimit, players, commanders: [], damage: Object.fromEntries(players.map(p => [p.id, {}])), commanderEnabled: false, history: [], undo: [], ended: false, deckId: config.deckId || "" };
}
function player(session: LifeSession, playerId: string) {
  const result = session.players.find(p => p.id === playerId);
  if (!result) throw new Error("Jogador não encontrado.");
  return result;
}
function applyChanges(session: LifeSession, changes: Change[], reverse = false): LifeSession {
  const result = structuredClone(session);
  for (const change of changes) {
    const p = player(result, change.playerId);
    const value = reverse ? change.before : change.after;
    integer(value, change.field === "life" ? Number.MIN_SAFE_INTEGER : 0);
    if (change.field === "damage") result.damage[p.id][change.commanderId!] = value;
    else p[change.field] = value;
  }
  return result;
}
export function changeCounters(session: LifeSession, request: { type: "life" | "poison" | "combat" | "correction"; playerId: string; value: number; commanderId?: string }, id: string, at: string): LifeSession {
  if (session.ended) throw new Error("A partida está encerrada. Reinicie para ajustar contadores.");
  const p = player(session, request.playerId);
  integer(request.value);
  let changes: Change[], source: string | undefined;
  if (request.type === "life" || request.type === "poison") {
    const field = request.type;
    const value = integer(p[field] + request.value, field === "poison" ? 0 : Number.MIN_SAFE_INTEGER);
    changes = [{ playerId: p.id, field, before: p[field], after: value }];
  } else {
    const commander = session.commanders.find(c => c.id === request.commanderId);
    if (!session.commanderEnabled || !commander) throw new Error("Ative e selecione um comandante.");
    const before = session.damage[p.id][commander.id] || 0;
    const after = integer(request.type === "combat" ? before + integer(request.value, 1) : request.value, 0);
    source = commander.name;
    changes = [{ playerId: p.id, field: "damage", commanderId: commander.id, before, after }];
    if (request.type === "combat") changes.push({ playerId: p.id, field: "life", before: p.life, after: integer(p.life - request.value) });
  }
  if (changes.every(c => c.before === c.after)) return session;
  const event: LifeEvent = { id, type: request.type, at, playerId: p.id, ...(source ? { source } : {}), changes };
  const result = applyChanges(session, changes);
  return { ...result, history: [...result.history, event], undo: [...result.undo, event] };
}
export function undoLast(session: LifeSession, id: string, at: string): LifeSession {
  if (session.ended || !session.undo.length) return session;
  const event = session.undo.at(-1)!;
  const result = applyChanges(session, event.changes, true);
  return { ...result, undo: result.undo.slice(0, -1), history: [...result.history, { id, type: "undo", at, playerId: event.playerId, ...(event.source ? { source: event.source } : {}), undoOf: event.id, changes: event.changes.map(c => ({ ...c, before: c.after, after: c.before })) }] };
}
export function rotatePlayer(session: LifeSession, playerId: string) {
  player(session, playerId);
  return { ...session, players: session.players.map(p => p.id === playerId ? { ...p, rotated: !p.rotated } : p) };
}
export function addCommander(session: LifeSession, ownerId: string, name: string, id: string): LifeSession {
  player(session, ownerId);
  if (!name.trim() || name.trim().length > 80 || session.commanders.some(c => c.id === id)) throw new Error("Informe um nome de comandante com 1 a 80 caracteres.");
  return { ...session, commanderEnabled: true, commanders: [...session.commanders, { id, name: name.trim(), ownerId, controllerId: ownerId }] };
}
export function changeController(session: LifeSession, commanderId: string, controllerId: string): LifeSession {
  player(session, controllerId);
  if (!session.commanders.some(c => c.id === commanderId)) throw new Error("Comandante não encontrado.");
  return { ...session, commanders: session.commanders.map(c => c.id === commanderId ? { ...c, controllerId } : c) };
}
export function restartSession(session: LifeSession, id: string): LifeSession {
  return { ...session, id, ended: false, history: [], undo: [], damage: Object.fromEntries(session.players.map(p => [p.id, {}])), players: session.players.map(p => ({ ...p, life: session.initialLife, poison: 0 })) };
}
export function alerts(session: LifeSession, p: Player) {
  return [p.life <= 0 ? "Vida em zero ou menos" : "", p.poison >= session.poisonLimit ? `Veneno: limite de ${session.poisonLimit} atingido` : "", ...session.commanders.filter(c => (session.damage[p.id][c.id] || 0) >= 21).map(c => `21 ou mais de ${c.name}`)].filter(Boolean);
}
export function textColor(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}
export function randomFace(faces: number, fill: (array: Uint32Array<ArrayBuffer>) => unknown = a => crypto.getRandomValues(a)) {
  if (![2,6].includes(faces)) throw new Error("Escolha D6 ou moeda.");
  const limit = Math.floor(4294967296 / faces) * faces;
  const sample = new Uint32Array(1);
  do { fill(sample); } while (sample[0] >= limit);
  return sample[0] % faces + 1;
}
