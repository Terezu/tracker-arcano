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
    name: string;
    image_uris?: {
      normal: string;
    };
    oracle_text?: string;
  }[];
}
interface ResolvedCard { card: Card; faceNames: string[] }
export function normalizeCardName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  // Treat isolated slash groups as face separators only when every part is named.
  // Keep apostrophes, commas, hyphens and malformed slash sequences untouched.
  if (/\/{3,}/.test(trimmed)) return trimmed;
  const faces = trimmed.split(/\s*\/{1,2}\s*/);
  return faces.length > 1 && faces.every(Boolean) ? faces.join(" // ") : trimmed;
}
const nameKey = (name: string) => normalizeCardName(name).toLowerCase();
function exactIdentity(cards: ResolvedCard[], name: string) {
  const matches = cards.filter(({ card, faceNames }) =>
    nameKey(card.name) === name || faceNames.some(face => nameKey(face) === name),
  );
  // Multiple printings of one Oracle identity are not different cards.
  return new Set(matches.map(({ card }) => card.oracle_id)).size === 1 ? matches[0]?.card : undefined;
}
async function collection(names: string[]): Promise<ResolvedCard[]> {
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
            !c.legalities?.pauper ||
            (c.card_faces !== undefined && (!Array.isArray(c.card_faces) || c.card_faces.some(f => typeof f.name !== "string" || !f.name.trim()))),
        )
      ) {
        throw new Error(
          "O Scryfall enviou uma resposta incompleta. Tente novamente.",
        );
      }
      return data.data.map((c) => ({ faceNames: c.card_faces?.map(f => f.name) || [], card: {
        id: c.id,
        name: c.name,
        oracle_id: c.oracle_id,
        type_line: c.type_line,
        oracle_text:
          c.oracle_text ||
          c.card_faces?.map((f) => f.oracle_text || "").join("\n") ||
          "",
        legalities: c.legalities,
        images: c.image_uris?.normal
          ? [c.image_uris.normal]
          : (c.card_faces || []).flatMap((f) =>
              f.image_uris?.normal ? [f.image_uris.normal] : [],
            ),
      } }));
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
  // Preserve punctuation for the first exact API lookup, including legitimate
  // slashes in a single-face name. Normalized keys are for identity and cache.
  const requested = new Map(parsed.entries.map(e => [nameKey(e.name), e.name.trim().replace(/\s+/g, " ").toLowerCase()]));
  const names = [...requested.keys()];
  const missing = names.filter(
    (n) => fresh || !cache.has(n) || Date.now() - cache.get(n)!.at > 86400000,
  );
  const errors: string[] = [];
  for (let i = 0; i < missing.length; i += 75) {
    const batch = missing.slice(i, i + 75);
    const cards = await collection(batch.map(name => requested.get(name)!));
    const unresolved = batch.filter(name => !exactIdentity(cards, name));
    // Collection identifiers may require a face name even for a full A // B name.
    // Resolve via the first face, then still verify the entire supplied identity.
    const frontNames = [...new Set(unresolved.filter(name => name.includes(" // ")).map(name => name.split(" // ")[0]))];
    const fallback = frontNames.length ? await collection(frontNames) : [];
    batch.forEach((name) => {
      const exact = exactIdentity([...cards, ...fallback], name);
      if (exact)
        cache.set(name, { card: exact, at: Date.now() });
      else {
        cache.delete(name);
        errors.push(
          `${name}: nome não encontrado ou ambíguo. Use o nome inglês exato da carta ou de sua face frontal.`,
        );
      }
    });
  }
  const entries = parsed.entries.map((e) => {
    const card = cache.get(nameKey(e.name))?.card;
    return { ...e, ...(card ? { name: card.name, card } : {}) };
  });
  return {
    entries,
    errors: [...errors, ...composition(entries)],
    checkedAt: new Date().toISOString(),
  };
}
