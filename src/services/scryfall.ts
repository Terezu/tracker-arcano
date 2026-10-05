import type { Card, Validation } from "../types";
import { composition, parseList } from "../lib/domain.ts";
const cache = new Map<
  string,
  {
    card: Card;
    at: number;
  }
>();
let queue: Promise<unknown> = Promise.resolve();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function retryDelay(header: string | null, now = Date.now()) {
  const seconds = header === null ? NaN : Number(header);
  const duration = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header || "") - now;
  return Math.max(30000, Number.isFinite(duration) ? duration : 0);
}
interface RawCard {
  id: string;
  name: string;
  oracle_id: string;
  type_line: string;
  oracle_text?: string;
  legalities: {
    pauper: string;
  };
  image_uris?: {
    normal: string;
  };
  card_faces?: {
    image_uris?: {
      normal: string;
    };
    oracle_text?: string;
  }[];
}
async function collection(names: string[]): Promise<Card[]> {
  const run = async () => {
    await pause(550);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        "https://api.scryfall.com/cards/collection",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            identifiers: names.map((name) => ({ name })),
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (response.status === 429) {
        await pause(retryDelay(response.headers.get("Retry-After")));
        continue;
      }
      if (!response.ok)
        throw new Error(
          `Scryfall indisponível (HTTP ${response.status}). Tente novamente.`,
        );
      const data = (await response.json()) as {
        data: RawCard[];
      };
      if (
        !Array.isArray(data.data) ||
        data.data.some(
          (c) =>
            !c.id ||
            !c.name ||
            !c.oracle_id ||
            !c.type_line ||
            !c.legalities?.pauper,
        )
      ) {
        throw new Error(
          "O Scryfall enviou uma resposta incompleta. Tente novamente.",
        );
      }
      return data.data.map((c) => ({
        id: c.id,
        name: c.name,
        oracle_id: c.oracle_id,
        type_line: c.type_line,
        oracle_text:
          c.oracle_text ||
          c.card_faces?.map((f) => f.oracle_text || "").join("\n") ||
          "",
        legalities: c.legalities,
        images: c.image_uris
          ? [c.image_uris.normal]
          : (c.card_faces || []).flatMap((f) =>
              f.image_uris ? [f.image_uris.normal] : [],
            ),
      }));
    }
    throw new Error(
      "Limite de consultas Scryfall atingido. Aguarde e tente novamente.",
    );
  };
  const request = queue.then(run);
  queue = request.catch(() => undefined);
  return request;
}
export async function validateList(
  text: string,
  fresh = false,
): Promise<Validation> {
  const parsed = parseList(text);
  if (parsed.errors.length)
    return { ...parsed, checkedAt: new Date().toISOString() };
  const names = [...new Set(parsed.entries.map((e) => e.name.toLowerCase()))];
  const missing = names.filter(
    (n) => fresh || !cache.has(n) || Date.now() - cache.get(n)!.at > 86400000,
  );
  const errors: string[] = [];
  for (let i = 0; i < missing.length; i += 75) {
    const batch = missing.slice(i, i + 75);
    const cards = await collection(batch);
    batch.forEach((name) => {
      // Only accept the complete, exact English name. Never select a fuzzy/partial match.
      const exact = cards.filter((c) => c.name.toLowerCase() === name);
      if (exact.length === 1)
        cache.set(name, { card: exact[0], at: Date.now() });
      else {
        cache.delete(name);
        errors.push(
          `${name}: nome completo não encontrado ou ambíguo. Use o nome inglês exato, incluindo todas as faces (A // B).`,
        );
      }
    });
  }
  const entries = parsed.entries.map((e) => ({
    ...e,
    ...(cache.has(e.name.toLowerCase())
      ? { card: cache.get(e.name.toLowerCase())!.card }
      : {}),
  }));
  return {
    entries,
    errors: [...errors, ...composition(entries)],
    checkedAt: new Date().toISOString(),
  };
}
