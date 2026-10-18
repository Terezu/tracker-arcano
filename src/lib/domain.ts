import type { Entry, Match } from "../types";
// Comparison always derives from the display name, including legacy documents.
export function normalizeOpponent(value = "") {
  const name = value.trim().replace(/\s+/gu, " ");
  return { name, key: name.normalize("NFKC").toLowerCase() };
}
export const missingOpponent = "missing:";
export function opponentValue(match: Pick<Match, "deckAdversario">) {
  const key = normalizeOpponent(match.deckAdversario).key;
  return key ? `name:${key}` : missingOpponent;
}
export function opponentOptions(matches: Match[]) {
  const options = new Map<string, string>();
  for (const match of matches) {
    const value = opponentValue(match);
    if (!options.has(value)) options.set(value, normalizeOpponent(match.deckAdversario).name || "Sem deck adversário informado");
  }
  return [...options].map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label, "pt-BR"));
}
export function matchPayload(value: Omit<Match, "id">) {
  const { deckAdversario, ...rest } = value;
  const name = normalizeOpponent(deckAdversario).name;
  if (name.length > 200) throw new Error("Deck do oponente: máximo de 200 caracteres.");
  return name ? { ...rest, deckAdversario: name } : rest;
}
export function filterMatches(
  matches: Match[],
  {
    deck = "",
    opponent = "",
    from = "",
    to = "",
  }: { deck?: string; opponent?: string; from?: string; to?: string },
) {
  return matches.filter(
    (m) =>
      (!deck || m.deckId === deck) &&
      (!opponent || opponentValue(m) === opponent) &&
      (!from || m.data >= from) &&
      (!to || m.data <= to),
  );
}
// IDs belong to each member's collection, not to a shared event.
export function teamResults<T extends { uid: string; matches: Match[] }>(
  members: T[],
  filters: { member?: string; deck?: string; opponent?: string; from?: string; to?: string },
) {
  const seen = new Set<string>();
  const individual = members
    .filter((m) => !filters.member || m.uid === filters.member)
    .map((m) => ({
      ...m,
      matches: filterMatches(m.matches, {
        ...filters,
        deck: filters.member ? filters.deck : "",
      }).filter((match) => {
        const key = JSON.stringify([m.uid, match.id]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }));
  return { individual, matches: individual.flatMap((m) => m.matches) };
}
export function parseList(text: string) {
  const entries: Entry[] = [],
    errors: string[] = [];
  let board: Entry["board"] = "main";
  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (/^(mainboard|main deck|main|deck|principal)\s*:?$/i.test(line)) {
      board = "main";
      return;
    }
    if (/^(sideboard|side|side board)\s*:?$/i.test(line)) {
      board = "side";
      return;
    }
    const side = /^SB:\s*/i.test(line);
    line = line.replace(/^SB:\s*/i, "");
    const match = /^(\d+)\s*x?\s+(.+)$/.exec(line);
    if (!match || +match[1] < 1 || +match[1] > 1000 || match[2].length > 160) {
      errors.push(`Linha ${index + 1} não reconhecida: ${raw}`);
      return;
    }
    entries.push({
      quantity: +match[1],
      name: match[2],
      board: side ? "side" : board,
    });
  });
  if (entries.length > 200) errors.push("Máximo de 200 linhas de cartas.");
  return { entries, errors };
}
export function composition(entries: Entry[]) {
  const errors: string[] = [];
  const total = (board: Entry["board"]) =>
    entries
      .filter((e) => e.board === board)
      .reduce((n, e) => n + e.quantity, 0);
  if (total("main") < 60)
    errors.push("A lista principal precisa de pelo menos 60 cartas.");
  if (total("side") > 15)
    errors.push("O sideboard pode ter no máximo 15 cartas.");
  const counts = new Map<
    string,
    {
      entry: Entry;
      count: number;
    }
  >();
  entries.forEach((e) => {
    const key = e.card?.oracle_id || e.name.toLowerCase();
    const old = counts.get(key);
    counts.set(key, { entry: e, count: (old?.count || 0) + e.quantity });
  });
  counts.forEach(({ entry: e, count }) => {
    const card = e.card;
    if (!card) {
      errors.push(`${e.name}: consulta não resolvida.`);
      return;
    }
    if (card.legalities.pauper !== "legal")
      errors.push(`${card.name}: ${card.legalities.pauper} no Pauper.`);
    let max = 4;
    if (
      /\bBasic\b/.test(card.type_line) ||
      /a deck can have any number of cards named/i.test(card.oracle_text)
    )
      max = Infinity;
    const words: Record<string, number> = {
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
    };
    const exception = /a deck can have up to (\w+) cards named/i.exec(
      card.oracle_text,
    );
    if (exception)
      max = words[exception[1].toLowerCase()] || Number(exception[1]) || max;
    if (count > max)
      errors.push(`${card.name}: ${count} cópias, limite ${max} no conjunto.`);
  });
  return errors;
}
export function statistics(matches: Pick<Match, "placar">[]) {
  let wins = 0,
    losses = 0,
    draws = 0,
    gamesWon = 0,
    gamesLost = 0;
  matches.forEach((m) => {
    const [a, b] = m.placar.split("-").map(Number);
    gamesWon += a;
    gamesLost += b;
    if (a > b) wins++;
    else if (a < b) losses++;
    else draws++;
  });
  return {
    total: matches.length,
    wins,
    losses,
    draws,
    gamesWon,
    gamesLost,
    matchRate: matches.length ? (wins / matches.length) * 100 : 0,
    gameRate:
      gamesWon + gamesLost ? (gamesWon / (gamesWon + gamesLost)) * 100 : 0,
  };
}
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function resultSlices(matches: Pick<Match, "placar">[]) {
  const s = statistics(matches);
  return [
    { key: "wins", label: "Vitórias", count: s.wins },
    { key: "losses", label: "Derrotas", count: s.losses },
    { key: "draws", label: "Empates", count: s.draws },
  ].map(slice => ({ ...slice, percent: s.total ? slice.count / s.total * 100 : 0 }));
}
