import { test } from "node:test";
import assert from "node:assert/strict";
import { retryDelay, validateList } from "../src/services/scryfall.ts";
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
              ...(name.includes("//")
                ? {
                    card_faces: [
                      {
                        image_uris: {
                          normal: "https://cards.scryfall.io/front.jpg",
                        },
                      },
                      {
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
    assert.deepEqual((await validateList("60 Mountain")).errors, []);
    assert.equal(calls.length, 1);
    await validateList("60 Mountain");
    assert.equal(calls.length, 1);
    const bad = await validateList(
      "60 Mountain\nSB: 1 Banned\nSB: 1 Missing\nSB: 1 Front",
    );
    assert.match(bad.errors.join(" "), /banned/);
    assert.match(bad.errors.join(" "), /missing/);
    assert.match(bad.errors.join(" "), /ambíguo/);
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
