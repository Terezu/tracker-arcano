import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composition,
  parseList,
  statistics,
  teamResults,
  filterMatches,
} from "../src/lib/domain.ts";
import type { Card, Entry, Score, Match } from "../src/types.ts";
const card = (name: string, extra: Partial<Card> = {}): Card => ({
  id: name,
  oracle_id: name,
  name,
  type_line: "Instant",
  oracle_text: "",
  legalities: { pauper: "legal" },
  images: [],
  ...extra,
});
test("os oito placares classificam partidas e jogos corretamente", () => {
  const cases: [Score, number, number, number, number, number][] = [
    ["2-0", 1, 0, 0, 2, 0],
    ["2-1", 1, 0, 0, 2, 1],
    ["1-1", 0, 0, 1, 1, 1],
    ["1-2", 0, 1, 0, 1, 2],
    ["0-2", 0, 1, 0, 0, 2],
    ["1-0", 1, 0, 0, 1, 0],
    ["0-1", 0, 1, 0, 0, 1],
    ["0-0", 0, 0, 1, 0, 0],
  ];
  for (const [placar, w, l, d, gW, gL] of cases) {
    const s = statistics([{ placar }]);
    assert.deepEqual(
      [s.wins, s.losses, s.draws, s.gamesWon, s.gamesLost],
      [w, l, d, gW, gL],
    );
  }
});
test("estatísticas vazias, empates e correções", () => {
  assert.equal(statistics([]).matchRate, 0);
  assert.equal(statistics([{ placar: "0-0" }]).gameRate, 0);
  const s = statistics([
    { placar: "2-1" },
    { placar: "1-1" },
    { placar: "0-0" },
  ]);
  assert.ok(Math.abs(s.matchRate - 100 / 3) < 0.000001);
  assert.equal(s.gameRate, 60);
  assert.equal(s.total, 3);
  assert.equal(statistics([{ placar: "0-2" }]).wins, 0);
  assert.equal(statistics([]).total, 0);
});
test("interpretação dos cabeçalhos, SB e linhas inválidas", () => {
  const p = parseList(
    "Mainboard:\n4 Lightning Bolt\n20 Mountain\nSB: 2 Pyroblast\nSideboard\n1 Hydroblast\nMain deck\n4x Counterspell",
  );
  assert.equal(p.errors.length, 0);
  assert.deepEqual(
    p.entries.map((e) => e.board),
    ["main", "main", "side", "side", "main"],
  );
  assert.equal(parseList("0 Mountain\ntexto\n-1 Island").errors.length, 3);
});
test("composição combina main e side, permite básicos e exceções Oracle", () => {
  const entries: Entry[] = [
    {
      name: "Mountain",
      quantity: 56,
      board: "main",
      card: card("Mountain", { type_line: "Basic Land — Mountain" }),
    },
    { name: "Bolt", quantity: 4, board: "main", card: card("Bolt") },
    { name: "Bolt", quantity: 1, board: "side", card: card("Bolt") },
  ];
  assert.match(composition(entries).join(" "), /5 cópias/);
  entries[2].quantity = 0;
  assert.deepEqual(composition(entries), []);
  assert.deepEqual(
    composition([
      {
        name: "Rats",
        quantity: 60,
        board: "main",
        card: card("Rats", {
          oracle_text: "A deck can have any number of cards named Rats.",
        }),
      },
    ]),
    [],
  );
  assert.match(
    composition([
      {
        name: "Dwarves",
        quantity: 60,
        board: "main",
        card: card("Dwarves", {
          oracle_text: "A deck can have up to seven cards named Dwarves.",
        }),
      },
    ]).join(" "),
    /limite 7/,
  );
});
test("legalidade depende de legalities.pauper, falha não vira versão válida", () => {
  assert.match(
    composition([
      {
        name: "Mountain",
        quantity: 60,
        board: "main",
        card: card("Mountain", {
          type_line: "Basic Land",
          legalities: { pauper: "banned" },
        }),
      },
    ]).join(" "),
    /banned/,
  );
  assert.match(
    composition([{ name: "Unknown", quantity: 60, board: "main" }]).join(" "),
    /não resolvida/,
  );
  assert.match(
    composition([
      {
        name: "Mountain",
        quantity: 59,
        board: "main",
        card: card("Mountain", { type_line: "Basic Land" }),
      },
      {
        name: "Island",
        quantity: 16,
        board: "side",
        card: card("Island", { type_line: "Basic Land" }),
      },
    ]).join(" "),
    /60.*15/,
  );
});

const teamMatch = (
  id: string,
  placar: Score,
  data = "2026-10-05",
  deckId = "d",
  versaoId = "v1",
): Match => ({
  id,
  placar,
  data,
  deckId,
  versaoId,
  criadoEm: "2026-10-05T12:00:00.000Z",
});
test("time recalcula taxas ponderadas, mantém membros vazios e identidade por UID", () => {
  const a = teamMatch("same", "2-0");
  const members = [
    { uid: "A", matches: [a, a] },
    {
      uid: "B",
      matches: [
        teamMatch("same", "0-2"),
        teamMatch("b2", "1-1"),
        teamMatch("b3", "0-0"),
      ],
    },
    { uid: "C", matches: [] },
  ];
  const result = teamResults(members, {});
  assert.equal(result.individual.length, 3);
  const s = statistics(result.matches);
  assert.equal(s.total, 4);
  assert.equal(s.matchRate, 25);
  assert.equal(s.gameRate, 50);
  for (const key of [
    "total",
    "wins",
    "losses",
    "draws",
    "gamesWon",
    "gamesLost",
  ] as const) {
    assert.equal(
      s[key],
      result.individual.reduce((sum, m) => sum + statistics(m.matches)[key], 0),
    );
  }
  assert.deepEqual(statistics(result.individual[2].matches), statistics([]));
});
test("filtros equivalentes preservam versões, datas inclusivas e decks por membro", () => {
  const members = [
    {
      uid: "A",
      matches: [
        teamMatch("a", "2-1"),
        teamMatch("old", "0-2", "2026-10-05", "d", "old"),
        teamMatch("outside", "2-0", "2026-10-04"),
        teamMatch("other", "1-1", "2026-10-05", "other"),
      ],
    },
    { uid: "B", matches: [teamMatch("b", "0-0")] },
  ];
  const filters = {
    member: "A",
    deck: "d",
    from: "2026-10-05",
    to: "2026-10-05",
  };
  const result = teamResults(members, filters);
  assert.deepEqual(result.matches, filterMatches(members[0].matches, filters));
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches,
    result.individual.flatMap((m) => m.matches),
  );
  assert.equal(teamResults(members, { from: "2026-10-05" }).matches.length, 4);
  assert.deepEqual(teamResults([], {}).matches, []);
});

import { normalizeOpponent, opponentOptions, missingOpponent, matchPayload, resultSlices } from "../src/lib/domain.ts";
test("opponent normalization preserves distinct names and Unicode equivalence", () => {
  for (const [a,b] of [["Krenko","krenko"],["Krenko"," Krenko "],["Edgar Markov","Edgar  Markov"],["EDGAR MARKOV","edgar markov"],["Caf\u00e9","Cafe\u0301"],["Krenko","\uff2brenko"]]) assert.equal(normalizeOpponent(a).key,normalizeOpponent(b).key);
  assert.notEqual(normalizeOpponent("Krenko!").key, normalizeOpponent("Krenko").key);
  assert.notEqual(normalizeOpponent("Edgar").key, normalizeOpponent("Edgar Markov").key);
  assert.equal(normalizeOpponent(" KreNKo ").name,"KreNKo");
});
test("match payload supports create, edit, clearing and legacy absence", () => {
  const legacy = teamMatch("1","2-0");
  assert.deepEqual(matchPayload(legacy),legacy);
  assert.equal(matchPayload({...legacy,deckAdversario:"  Edgar  Markov "}).deckAdversario,"Edgar Markov");
  assert.equal(matchPayload({...legacy,deckAdversario:"Yuriko"}).deckAdversario,"Yuriko");
  assert.equal("deckAdversario" in matchPayload({...legacy,deckAdversario:" "}),false);
  assert.throws(() => matchPayload({...legacy,deckAdversario:"x".repeat(201)}));
});
const confrontationMatches: Match[] = [
  {...teamMatch("1","2-0",undefined,"atraxa"),deckAdversario:"Krenko"},
  {...teamMatch("2","0-2",undefined,"atraxa"),deckAdversario:" krenko "},
  {...teamMatch("3","2-1",undefined,"atraxa"),deckAdversario:"Yuriko"},
  teamMatch("4","1-1",undefined,"atraxa"),
  {...teamMatch("5","2-0",undefined,"muldrotha"),deckAdversario:"KRENKO"},
];
test("individual confrontations isolate decks, include missing and sum to deck totals", () => {
  const deck = filterMatches(confrontationMatches,{deck:"atraxa"});
  assert.equal(deck.length,4);
  assert.equal(opponentOptions(deck).length,3);
  assert.equal(filterMatches(confrontationMatches,{deck:"atraxa",opponent:"name:krenko"}).length,2);
  assert.equal(statistics(filterMatches(confrontationMatches,{deck:"muldrotha",opponent:"name:krenko"})).matchRate,100);
  assert.equal(filterMatches(deck,{opponent:missingOpponent}).length,1);
  assert.equal(opponentOptions(deck).reduce((n,o)=>n+filterMatches(deck,{opponent:o.value}).length,0),deck.length);
  assert.equal(filterMatches(confrontationMatches,{}).length,5);
});
test("team member and opponent filters are independent AND intersections, dedup by uid/id", () => {
  const members = [{uid:"A",matches:[...confrontationMatches,confrontationMatches[0]]},{uid:"B",matches:[{...confrontationMatches[0],placar:"0-2" as const}]}];
  assert.equal(teamResults(members,{}).matches.length,6);
  assert.equal(teamResults(members,{member:"A"}).matches.length,5);
  assert.equal(teamResults(members,{opponent:"name:krenko"}).matches.length,4);
  const combined=teamResults(members,{member:"A",opponent:"name:krenko"});
  assert.equal(combined.matches.length,3);
  assert.equal(combined.individual.length,1);
  assert.equal(teamResults(members,{member:"B",opponent:"name:krenko"}).matches.length,1);
  assert.equal(teamResults(members,{member:"B",opponent:missingOpponent}).matches.length,0);
  assert.equal(teamResults(members,{}).matches.length,6);
});
test("pie counts and percentages reflect filters, draws and empty results", () => {
  const matches = Array.from({length:20},(_,i)=>({placar:i<12 ? "2-0" as const : "0-2" as const}));
  assert.deepEqual(resultSlices(matches).map(s=>[s.count,s.percent]),[[12,60],[8,40],[0,0]]);
  assert.deepEqual(resultSlices([]).map(s=>s.percent),[0,0,0]);
  assert.equal(resultSlices([{placar:"0-0"}])[2].percent,100);
  assert.equal(resultSlices(filterMatches(confrontationMatches,{deck:"muldrotha"}))[0].percent,100);
});
