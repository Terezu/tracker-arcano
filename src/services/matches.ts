import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  writeBatch,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Match } from "../types";
const root = (uid: string) => `usuarios/${uid}`;
const matchCache = new Map<string, Match[]>();
const pendingScans = new Map<string, Promise<Match[]>>();
let cacheGeneration = 0;
export function clearDataCache() {
  cacheGeneration++;
  matchCache.clear();
  pendingScans.clear();
}
export async function matchPage(uid: string, cursor?: QueryDocumentSnapshot) {
  const s = await getDocs(
    query(
      collection(db, `${root(uid)}/partidas`),
      orderBy("data", "desc"),
      orderBy("__name__", "desc"),
      limit(50),
      ...(cursor ? [startAfter(cursor)] : []),
    ),
  );
  return {
    matches: s.docs.map((d) => ({ ...d.data(), id: d.id }) as Match),
    cursor: s.size === 50 ? s.docs.at(-1) : undefined,
  };
}
// A separate paginated scan supplies complete statistics, never just the visible history page.
export async function allMatches(uid: string) {
  const cached = matchCache.get(uid);
  if (cached) return cached;
  const pending = pendingScans.get(uid);
  if (pending) return pending;
  const generation = cacheGeneration;
  const scan = scanMatches(uid).then((result) => {
    if (generation === cacheGeneration) matchCache.set(uid, result);
    return result;
  });
  pendingScans.set(uid, scan);
  try {
    return await scan;
  } finally {
    if (pendingScans.get(uid) === scan) pendingScans.delete(uid);
  }
}
async function scanMatches(uid: string) {
  const result: Match[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const page = await matchPage(uid, cursor);
    result.push(...page.matches);
    cursor = page.cursor;
  } while (cursor);
  return result;
}
export async function saveMatch(
  uid: string,
  value: Omit<Match, "id">,
  id?: string,
) {
  const ref = id
    ? doc(db, `${root(uid)}/partidas/${id}`)
    : doc(collection(db, `${root(uid)}/partidas`));
  await setDoc(ref, value);
  const cached = matchCache.get(uid);
  if (cached)
    matchCache.set(uid, [
      ...cached.filter((m) => m.id !== ref.id),
      { ...value, id: ref.id },
    ]);
}
export async function deleteMatch(uid: string, id: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, `${root(uid)}/partidas/${id}`));
  await batch.commit();
  const cached = matchCache.get(uid);
  if (cached)
    matchCache.set(
      uid,
      cached.filter((m) => m.id !== id),
    );
}
