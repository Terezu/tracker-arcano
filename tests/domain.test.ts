import { test } from "node:test";
import assert from "node:assert/strict";
import { composition, parseList, statistics } from "../src/lib/domain.ts";
import type { Card, Entry, Score } from "../src/types.ts";
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
