import type { Entry, Match } from "../types";
// Comparison always derives from the display name, including legacy documents.
export function normalizeOpponent(value = "") {
  const name = value.trim().replace(/\s+/gu, " ");
  return { name, key: name.normalize("NFKC").toLowerCase() };
}
const colorOrder = "wubrg";
const colorNames: Record<string, string> = {
  white: "w", branco: "w", branca: "w", blue: "u", azul: "u", black: "b", preto: "b", preta: "b",
  red: "r", vermelho: "r", vermelha: "r", green: "g", verde: "g",
  azorius: "wu", dimir: "ub", rakdos: "br", gruul: "rg", selesnya: "gw",
  orzhov: "wb", izzet: "ur", golgari: "bg", boros: "rw", simic: "gu",
  esper: "wub", grixis: "ubr", jund: "brg", naya: "rgw", bant: "gwu",
  abzan: "wbg", jeskai: "urw", sultai: "bgu", mardu: "rwb", temur: "gur",
};
// English and Portuguese names of the same archetype share the first spelling.
const archetypes = [
  "fairies fairy faerie faeries fada fadas", "elves elf elfo elfos", "goblins goblin duende duendes",
  "affinity afinidade", "burn queima", "control controle", "tokens token ficha fichas",
  "reanimator reanimador reanimacao", "zombies zombie zumbi zumbis", "vampires vampire vampiro vampiros",
  "rats rat rato ratos", "spirits spirit espirito espiritos", "angels angel anjo anjos",
  "dragons dragon dragao dragoes", "knights knight cavaleiro cavaleiros", "soldiers soldier soldado soldados",
  "wizards wizard mago magos", "merfolk tritao tritoes", "slivers sliver fractius",
  "walls wall muralha muralhas parede paredes", "gates gate portao portoes", "artifacts artifact artefato artefatos",
  "sacrifice sacrificio", "madness loucura", "ramp rampa", "aggro agro", "storm tempestade", "cycling ciclagem",
];
const archetypeAliases = new Map(archetypes.flatMap(group => {
  const names = group.split(" ");
  return names.map(name => [name, names[0]] as const);
}));
const ignoredOpponentWords = new Set(["e", "and", "de", "do", "da", "dos", "das", "of", "the", "deck"]);
function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
function archetypeWord(word: string) {
  const known = archetypeAliases.get(word);
  if (known) return known;
  // Typos only: short words and a different first letter (Lizards/Wizards) are distinct names.
  if (word.length >= 5)
    for (const [alias, canonical] of archetypeAliases)
      if (alias.length >= 5 && alias[0] === word[0] && withinOneEdit(word, alias)) return canonical;
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}
// Derived on every read, so stored names stay intact and grouping does not depend on the
// matches in view: "UB Fadas", "Fairies (U/B)" and "Dimir Faeries" share one key.
export function opponentKey(value = "") {
  const words = normalizeOpponent(value).key.normalize("NFKD").replace(/[\p{M}'’]/gu, "").match(/[\p{L}\p{N}]+/gu) || [];
  const colors = new Set<string>();
  const rest: string[] = [];
  for (const word of words) {
    if (ignoredOpponentWords.has(word)) continue;
    const named = colorNames[word];
    if (named || (/^[wubrg]+$/.test(word) && new Set(word).size === word.length)) [...(named || word)].forEach(c => colors.add(c));
    else rest.push(word === "mono" ? word : archetypeWord(word));
  }
  const identity = [...colorOrder].filter(c => colors.has(c)).join("");
  // Mono Red and Red are the same identity; "mono" alone still says something.
  const others = (identity ? rest.filter(word => word !== "mono") : rest).sort();
  return [identity, ...others].filter(Boolean).join(" ") || normalizeOpponent(value).key;
}
export const missingOpponent = "missing:";
export function opponentValue(match: Pick<Match, "deckAdversario">) {
  const key = opponentKey(match.deckAdversario);
  return key ? `name:${key}` : missingOpponent;
}
// Most played first, with unnamed opponents last. The label is the most used spelling.
export function opponentGroups(matches: Match[]) {
  const groups = new Map<string, { matches: Match[]; spellings: Map<string, { name: string; count: number }> }>();
  for (const match of matches) {
    const value = opponentValue(match);
    const group = groups.get(value) || { matches: [] as Match[], spellings: new Map<string, { name: string; count: number }>() };
    const { name, key } = normalizeOpponent(match.deckAdversario);
    const spelling = group.spellings.get(key) || { name, count: 0 };
    spelling.count++;
    group.spellings.set(key, spelling);
    group.matches.push(match);
    groups.set(value, group);
  }
  return [...groups].map(([value, group]) => {
    const spellings = [...group.spellings.values()].sort((a, b) => b.count - a.count);
    return {
      value,
      label: spellings[0].name || "Sem deck adversário informado",
      aliases: spellings.map(s => s.name),
      matches: group.matches,
    };
  }).sort((a, b) =>
    Number(a.value === missingOpponent) - Number(b.value === missingOpponent) ||
    b.matches.length - a.matches.length ||
    a.label.localeCompare(b.label, "pt-BR"));
}
export function opponentOptions(matches: Match[]) {
  return opponentGroups(matches)
    .map(({ value, label }) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
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
// A month is the inclusive date range from its first to its last day.
export function monthRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(year, number, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
export function rangeMonth(from: string, to: string) {
  const month = from.slice(0, 7);
  const range = month ? monthRange(month) : undefined;
  return range?.from === from && range.to === to ? month : "";
}
export function monthOptions(matches: Pick<Match, "data">[], selected = "") {
  const months = new Set(matches.map((m) => m.data.slice(0, 7)));
  if (selected) months.add(selected);
  return [...months].sort().reverse().map((value) => {
    const [year, number] = value.split("-").map(Number);
    const label = new Date(year, number - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
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

const winningScores = new Set<string>(["2-0", "2-1", "1-0"]);
// Ordered by match date, then by registration; filters of period and opponent never apply.
// Every loss or draw resets the sequence, which only grows again with a new win.
export function winStreak(matches: Pick<Match, "data" | "criadoEm" | "placar">[]) {
  const ordered = [...matches].sort((a, b) =>
    a.data.localeCompare(b.data) || (a.criadoEm || "").localeCompare(b.criadoEm || ""));
  return ordered.reduce((streak, m) => (winningScores.has(m.placar) ? streak + 1 : 0), 0);
}
