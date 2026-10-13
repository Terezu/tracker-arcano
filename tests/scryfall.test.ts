import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCardName, retryDelay, validateList } from "../src/services/scryfall.ts";
import { scryfallFixtures } from "./fixtures/scryfall-multiface.ts";

test("normalização conserva pontuação e nomes comuns e rejeita separadores malformados", () => {
  for (const input of ["Tithing Blade // Consuming Sepulcher", "Tithing Blade / Consuming Sepulcher", "Tithing Blade//Consuming Sepulcher", "Tithing Blade/Consuming Sepulcher"])
    assert.equal(normalizeCardName(input),"Tithing Blade // Consuming Sepulcher");
  assert.equal(normalizeCardName("  Tithing   Blade  "),"Tithing Blade");
  for (const name of ["Gix's Command", "B.F.M. (Big Furry Monster)", "Who/What/When/Where/Why", "Tithing Blade /// Consuming Sepulcher", "Front /", "/ Back"])
    assert.equal(normalizeCardName(name),name === "Who/What/When/Where/Why" ? "Who // What // When // Where // Why" : name);
});

test("Scryfall: cinco entradas de Tithing Blade, layouts, identidades e versão anterior", async () => {
  const original = globalThis.fetch;
  const calls: string[][] = [];
  globalThis.fetch = async (_url, options) => {
    const names: string[] = JSON.parse(String(options?.body)).identifiers.map((i: {name:string})=>i.name);
    calls.push(names);
    // Reproduces collection's real behavior: full DFC names are not resolved.
    const data = names.flatMap(name => {
      if (name === "ambiguous front") return [1,2].map(n=>({ ...scryfallFixtures[1], id:`ambiguous-${n}`, oracle_id:`different-${n}`, card_faces:[{name:"Ambiguous Front"},{name:`Back ${n}`}] }));
      if (name === "wrong result") return [scryfallFixtures[1]];
      if (name === "question/answer") return [{ ...scryfallFixtures[0], name:"Question/Answer", id:"punctuation", oracle_id:"punctuation-oracle" }];
      const match = scryfallFixtures.find(c => c.name.toLowerCase() === name && !name.includes("//") || "card_faces" in c && c.card_faces.some(f=>f.name.toLowerCase()===name));
      return match ? [match] : [];
    });
    return new Response(JSON.stringify({object:"list",data,not_found:names.filter(n=>n.includes("//")).map(name=>({name}))}));
  };
  try {
    const inputs = ["Tithing Blade", "Tithing Blade // Consuming Sepulcher", "Tithing Blade / Consuming Sepulcher", "Tithing Blade//Consuming Sepulcher", "Tithing Blade/Consuming Sepulcher"];
    for (const input of inputs) {
      const result = await validateList(`56 Mountain\n4 ${input}`,true);
      assert.deepEqual(result.errors,[]);
      assert.equal(result.entries[1].name,scryfallFixtures[1].name);
      assert.equal(result.entries[1].card?.name,scryfallFixtures[1].name);
      assert.equal(result.entries[1].card?.id,scryfallFixtures[1].id);
      assert.equal(result.entries[1].card?.oracle_id,scryfallFixtures[1].oracle_id);
      assert.equal(result.entries[1].quantity,4);
      assert.equal(result.entries[1].card?.images.length,2);
    }
    assert.ok(calls.some(names=>names.includes("tithing blade")));
    const count = calls.length;
    await validateList("56 Mountain\n4 Tithing Blade/Consuming Sepulcher");
    assert.equal(calls.length,count,"normalized aliases share the cache");
    const punctuation = await validateList("60 Mountain\nSB: 1 Question/Answer",true);
    assert.equal(punctuation.entries[1].name,"Question/Answer");
    assert.deepEqual(punctuation.errors,[]);
    assert.ok(calls.at(-1)?.includes("question/answer"),"the initial exact lookup preserves legitimate punctuation");
    for (const fixture of scryfallFixtures.slice(2)) {
      const result = await validateList(`60 Mountain\nSB: 1 ${fixture.name}`,true);
      assert.equal(result.entries[1].card?.name,fixture.name);
      assert.equal(result.entries[1].card?.images.length,"image_uris" in fixture ? 1 : 2);
      assert.ok(result.entries[1].card?.oracle_text.includes('Rules for'));
      if (fixture.legalities.pauper !== "legal") assert.match(result.errors.join(' '),/not_legal/);
      else assert.deepEqual(result.errors,[]);
    }
    for (const invalid of ["Nonexistent Card", "Ambiguous Front", "Wrong Result", "Tithing Blade // Wrong Back", "Tithing", "Tithing Blade /// Consuming Sepulcher"]) {
      const result = await validateList(`60 Mountain\nSB: 1 ${invalid}`,true);
      assert.match(result.errors.join(' '),/não encontrado ou ambíguo/);
      assert.equal(result.entries[1].card,undefined);
    }
    const version = await validateList("58 Mountain\n2 Tithing Blade\nSB: 2 Tithing Blade/Consuming Sepulcher",true);
    assert.deepEqual(version.errors,[]);
    assert.deepEqual(version.entries.map(e=>[e.board,e.quantity]),[["main",58],["main",2],["side",2]]);
    assert.equal(version.entries[1].card?.oracle_id,version.entries[2].card?.oracle_id);
    const snapshot = JSON.stringify(version);
    const over = await validateList("58 Mountain\n2 Tithing Blade\nSB: 3 Tithing Blade/Consuming Sepulcher",true);
    assert.match(over.errors.join(' '),/5 cópias, limite 4/);
    assert.equal(JSON.stringify(version),snapshot,"later validations must not mutate previous version data");
    assert.equal(version.entries.reduce((total,e)=>total+e.quantity,0),62);
  } finally { globalThis.fetch = original; }
});
test("HTTP 429 respeita pausa mínima e Retry-After em segundos ou data", () => {
  assert.equal(retryDelay(null), 30000);
  assert.equal(retryDelay("inválido"), 30000);
  assert.equal(retryDelay("3"), 30000);
  assert.equal(retryDelay("90"), 90000);
  assert.equal(
    retryDelay(
      "Mon, 05 Oct 2026 12:01:00 GMT",
      Date.parse("2026-10-05T12:00:00Z"),
    ),
    60000,
  );
});
test("Scryfall: lotes, cache, faces, nomes exatos e falhas bloqueiam validação", async () => {
  const original = globalThis.fetch;
  const calls: string[][] = [];
  globalThis.fetch = async (_url, options) => {
    const names = (
      JSON.parse(String(options?.body)) as {
        identifiers: {
          name: string;
        }[];
      }
    ).identifiers.map((i) => i.name);
    calls.push(names);
    const data = names.flatMap((name) =>
      name === "missing"
        ? []
        : [
            {
              id: name,
              oracle_id: name,
              name: name === "front" ? "Front // Back" : name,
              type_line:
                name === "mountain" ? "Basic Land — Mountain" : "Instant",
              oracle_text: "",
              legalities: { pauper: name === "banned" ? "banned" : "legal" },
              ...(name.includes("//") || name === "front"
                ? {
                    card_faces: [
                      {
                        name: "Front",
                        image_uris: {
                          normal: "https://cards.scryfall.io/front.jpg",
                        },
                      },
                      {
                        name: "Back",
                        image_uris: {
                          normal: "https://cards.scryfall.io/back.jpg",
                        },
                      },
                    ],
                  }
                : {
                    image_uris: {
                      normal: "https://cards.scryfall.io/card.jpg",
                    },
                  }),
            },
          ],
    );
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  try {
    assert.deepEqual((await validateList("60 Mountain", true)).errors, []);
    assert.equal(calls.length, 1);
    await validateList("60 Mountain");
    assert.equal(calls.length, 1);
    const bad = await validateList(
      "60 Mountain\nSB: 1 Banned\nSB: 1 Missing\nSB: 1 Front",
    );
    assert.match(bad.errors.join(" "), /banned/);
    assert.match(bad.errors.join(" "), /missing/);
    assert.equal(bad.entries.at(-1)?.card?.name,"Front // Back");
    const faces = await validateList("60 Mountain\nSB: 1 Front // Back");
    assert.equal(faces.entries[1].card?.images.length, 2);
    assert.deepEqual(faces.errors, []);
    await validateList(
      Array.from({ length: 76 }, (_, i) => `1 Unique${i}`).join("\n"),
    );
    assert.deepEqual(
      calls.slice(-2).map((c) => c.length),
      [75, 1],
    );
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    await assert.rejects(validateList("60 NetworkFailure", true), /503/);
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    await assert.rejects(validateList("60 NetworkFailure", true), /offline/);
  } finally {
    globalThis.fetch = original;
  }
});
