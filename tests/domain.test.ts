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

import { normalizeOpponent, opponentKey, opponentGroups, opponentOptions, missingOpponent, matchPayload, resultSlices, monthRange, rangeMonth, monthOptions } from "../src/lib/domain.ts";
test("mês cobre do primeiro ao último dia, inclusive anos bissextos", () => {
  assert.deepEqual(monthRange("2026-10"),{from:"2026-10-01",to:"2026-10-31"});
  assert.deepEqual(monthRange("2026-02"),{from:"2026-02-01",to:"2026-02-28"});
  assert.deepEqual(monthRange("2028-02"),{from:"2028-02-01",to:"2028-02-29"});
  assert.deepEqual(monthRange("2026-12"),{from:"2026-12-01",to:"2026-12-31"});
  const matches = [teamMatch("before","2-0","2026-09-30"),teamMatch("first","2-0","2026-10-01"),teamMatch("last","2-0","2026-10-31"),teamMatch("after","2-0","2026-11-01")];
  assert.deepEqual(filterMatches(matches,monthRange("2026-10")).map(m=>m.id),["first","last"]);
});
test("mês só é reconhecido quando o período é exatamente o mês inteiro", () => {
  assert.equal(rangeMonth("2026-10-01","2026-10-31"),"2026-10");
  assert.equal(rangeMonth("2026-10-01","2026-10-30"),"");
  assert.equal(rangeMonth("2026-10-02","2026-10-31"),"");
  assert.equal(rangeMonth("2026-10-01",""),"");
  assert.equal(rangeMonth("","2026-10-31"),"");
  assert.equal(rangeMonth("",""),"");
});
test("opções de mês são únicas, mais recentes primeiro e preservam a seleção", () => {
  const matches = [teamMatch("a","2-0","2026-02-10"),teamMatch("b","2-0","2026-10-05"),teamMatch("c","2-0","2026-10-20"),teamMatch("d","2-0","2025-12-01")];
  assert.deepEqual(monthOptions(matches).map(o=>o.value),["2026-10","2026-02","2025-12"]);
  assert.equal(monthOptions(matches)[0].label,"Outubro de 2026");
  assert.deepEqual(monthOptions(matches,"2026-05").map(o=>o.value),["2026-10","2026-05","2026-02","2025-12"]);
  assert.deepEqual(monthOptions([]),[]);
});
test("opponent normalization preserves distinct names and Unicode equivalence", () => {
  for (const [a,b] of [["Krenko","krenko"],["Krenko"," Krenko "],["Edgar Markov","Edgar  Markov"],["EDGAR MARKOV","edgar markov"],["Caf\u00e9","Cafe\u0301"],["Krenko","\uff2brenko"]]) assert.equal(normalizeOpponent(a).key,normalizeOpponent(b).key);
  assert.notEqual(normalizeOpponent("Krenko!").key, normalizeOpponent("Krenko").key);
  assert.notEqual(normalizeOpponent("Edgar").key, normalizeOpponent("Edgar Markov").key);
  assert.equal(normalizeOpponent(" KreNKo ").name,"KreNKo");
});
test("nomes similares de adversários compartilham a mesma chave", () => {
  const same = [
    ["UB Fairies","UB Fadas"],["UB Fairies","Fadas UB"],["UB Fairies","BU Faeries"],["UB Fairies","U/B Fairy"],
    ["UB Fairies","Dimir Fadas"],["UB Fairies","Azul e Preto Fadas"],["UB Fairies","Blue Black Fairies"],["UB Fairies","UB Fairy's"],
    ["Mono Red Burn","Mono R Queima"],["Mono Red Burn","Vermelho Burn"],
    ["Affinity","Afinity"],["Affinity","Afinidade"],["Caw-Gates","Caw Portões"],["Goblins","Goblin"],["Krenko","Krenko!"],["Deck de Elfos","Elves"],
  ];
  for (const [a,b] of same) assert.equal(opponentKey(a),opponentKey(b),`${a} = ${b}`);
  const distinct = [
    ["UB Fairies","UR Fairies"],["UB Fairies","Fairies"],["UB Fairies","UB Control"],["Edgar","Edgar Markov"],
    ["Wizards","Lizards"],["Elves","Goblins"],["Mono Red","Mono Green"],["Mono Burn","Burn"],["Rats","Bats"],
  ];
  for (const [a,b] of distinct) assert.notEqual(opponentKey(a),opponentKey(b),`${a} != ${b}`);
  assert.equal(opponentKey(""),"");
  assert.equal(opponentKey("!!!"),"!!!");
});
test("grupos de adversários somam o total, usam a grafia mais comum e deixam sem nome por último", () => {
  const matches: Match[] = [
    teamMatch("0","1-1"),teamMatch("00","1-1"),teamMatch("000","1-1"),
    {...teamMatch("1","2-0"),deckAdversario:"UB Fadas"},
    {...teamMatch("2","0-2"),deckAdversario:"UB Fairies"},
    {...teamMatch("3","2-1"),deckAdversario:"ub fairies"},
    {...teamMatch("4","2-1"),deckAdversario:"Krenko"},
  ];
  const groups = opponentGroups(matches);
  assert.deepEqual(groups.map(g=>[g.label,g.matches.length]),[["UB Fairies",3],["Krenko",1],["Sem deck adversário informado",3]]);
  assert.deepEqual(groups[0].aliases,["UB Fairies","UB Fadas"]);
  assert.equal(groups.reduce((n,g)=>n+g.matches.length,0),matches.length);
  assert.deepEqual(resultSlices(groups[0].matches).map(s=>s.count),[2,1,0]);
  assert.equal(filterMatches(matches,{opponent:groups[0].value}).length,3);
  assert.equal(opponentOptions(matches).length,3);
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
import { winStreak, bestWinStreak, currentStreakLeader, streakItems } from "../src/lib/domain.ts";
test("streak soma só 2-0, 2-1 e 1-0 e zera em derrota ou empate", () => {
  const at = (id: string, placar: Score, data: string, criadoEm = `${data}T12:00:00.000Z`): Match => ({...teamMatch(id,placar,data),criadoEm});
  assert.equal(winStreak([]),0);
  assert.equal(winStreak([at("a","2-0","2026-10-01"),at("b","2-1","2026-10-02"),at("c","1-0","2026-10-03")]),3);
  for (const reset of ["1-1","0-0","1-2","0-2","0-1"] as const)
    assert.equal(winStreak([at("a","2-0","2026-10-01"),at("b",reset,"2026-10-02")]),0,reset);
  assert.equal(winStreak([at("a","2-0","2026-10-01"),at("b","0-2","2026-10-02"),at("c","2-1","2026-10-03")]),1);
  // A match registered later with an older date takes its place by match date.
  assert.equal(winStreak([at("a","2-0","2026-10-02"),at("b","2-0","2026-10-03"),at("c","0-2","2026-10-01","2026-10-10T00:00:00.000Z")]),2);
  // Same day: registration order decides which result is the last one.
  assert.equal(winStreak([at("a","0-2","2026-10-01","2026-10-01T10:00:00.000Z"),at("b","2-0","2026-10-01","2026-10-01T11:00:00.000Z")]),1);
  assert.equal(winStreak([at("b","2-0","2026-10-01","2026-10-01T11:00:00.000Z"),at("a","0-2","2026-10-01","2026-10-01T12:00:00.000Z")]),0);
});
const streakMatch = (id: string, placar: Score, data: string, deckId = "d"): Match => ({...teamMatch(id,placar,data,deckId),criadoEm:`${data}T12:00:00.000Z`});
test("maior streak é a sequência mais longa; a atual pode ser menor", () => {
  const matches = [streakMatch("a","2-0","2026-01-01"),streakMatch("b","2-1","2026-01-02"),streakMatch("c","1-0","2026-01-03"),streakMatch("d","0-1","2026-01-04"),streakMatch("e","2-0","2026-01-05")];
  assert.equal(bestWinStreak(matches),3);
  assert.equal(winStreak(matches),1);
  assert.equal(bestWinStreak([]),0);
  assert.equal(bestWinStreak([streakMatch("a","1-1","2026-01-01")]),0);
});
test("líder entre decks: só ativos, todos os empatados e ninguém no zero", () => {
  const decks = [{id:"a",nome:"Redness",arquivado:false},{id:"b",nome:"Fadas",arquivado:false},{id:"c",nome:"Antigo",arquivado:true},{id:"z",nome:"Sem partidas",arquivado:false}];
  const matches = [
    streakMatch("1","2-0","2026-01-01","a"),streakMatch("2","2-0","2026-01-02","a"),
    streakMatch("3","2-0","2026-01-01","b"),streakMatch("4","2-1","2026-01-03","b"),
    streakMatch("5","2-0","2026-01-01","c"),streakMatch("6","2-0","2026-01-02","c"),streakMatch("7","2-0","2026-01-03","c"),
  ];
  assert.deepEqual(currentStreakLeader(decks,matches),{value:2,decks:["Redness","Fadas"]});
  assert.deepEqual(currentStreakLeader(decks,[...matches,streakMatch("8","0-2","2026-01-04","b")]),{value:2,decks:["Redness"]});
  assert.deepEqual(currentStreakLeader(decks,[streakMatch("9","0-0","2026-01-01","a")]),{value:0,decks:[]});
  assert.deepEqual(currentStreakLeader([],[]),{value:0,decks:[]});
});
test("cartões de streak: deck usa período no recorde; sem deck mostra o líder", () => {
  const decks = [{id:"d",nome:"Redness",arquivado:false},{id:"e",nome:"Fadas",arquivado:false}];
  const matches = [streakMatch("1","2-0","2026-01-10"),streakMatch("2","2-0","2026-01-20"),streakMatch("3","0-2","2026-02-01"),streakMatch("4","2-0","2026-02-10"),{...streakMatch("5","2-0","2026-02-11"),deckAdversario:"Krenko"},streakMatch("6","0-2","2026-02-12","e")];
  assert.deepEqual(streakItems(decks,matches,{deck:"d"}).map(i=>[i.label,i.value]),[["Maior Streak de Vitória",2],["Streak de Vitória Atual",2]]);
  assert.deepEqual(streakItems(decks,matches,{deck:"d",from:"2026-02-01",to:"2026-02-28"}).map(i=>i.value),[2,2]);
  assert.deepEqual(streakItems(decks,matches,{deck:"d",from:"2026-02-01",to:"2026-02-10"}).map(i=>i.value),[1,2]);
  assert.deepEqual(streakItems(decks,matches,{}),[{label:"Maior Streak Atual entre Decks",value:2,detail:"Redness"}]);
  assert.deepEqual(streakItems(decks,[],{}),[{label:"Maior Streak Atual entre Decks",value:0,detail:undefined}]);
});
import { retryChunk } from "../src/lib/chunkRetry.ts";
test("aba com arquivo antigo recarrega uma vez e nunca entra em loop", async () => {
  const memory = () => { const m = new Map<string,string>(); return { getItem:(k:string)=>m.get(k) ?? null, setItem:(k:string,v:string)=>{m.set(k,v);}, removeItem:(k:string)=>{m.delete(k);}, size:()=>m.size }; };
  const failing = () => Promise.reject(new Error("chunk"));
  const storage = memory();
  let reloads = 0;
  const pending = retryChunk(failing, storage, () => { reloads++; });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(reloads, 1);
  void pending;
  // After the reload the flag is set, so a second failure is reported instead of reloading.
  await assert.rejects(retryChunk(failing, storage, () => { reloads++; }), /chunk/);
  assert.equal(reloads, 1);
  assert.equal(storage.size(), 0);
  // A successful load clears the flag for future deploys.
  storage.setItem("tracker-arcano:chunk-reload","1");
  assert.equal(await retryChunk(() => Promise.resolve("ok"), storage, () => { reloads++; }), "ok");
  assert.equal(storage.size(), 0);
  // Blocked storage: no reload at all, the error surfaces.
  const blocked = { getItem(){ throw new Error("blocked"); }, setItem(){ throw new Error("blocked"); }, removeItem(){ throw new Error("blocked"); } };
  await assert.rejects(retryChunk(failing, blocked, () => { reloads++; }), /chunk/);
  await assert.rejects(retryChunk(failing, undefined, () => { reloads++; }), /chunk/);
  assert.equal(reloads, 1);
});
