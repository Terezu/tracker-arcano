import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  updateDoc,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Deck, Validation, Version } from "../types";
const root = (uid: string) => `usuarios/${uid}`;
export async function listDecks(uid: string) {
  const result: Deck[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const s = await getDocs(
      query(
        collection(db, `${root(uid)}/decks`),
        orderBy("__name__"),
        limit(100),
        ...(cursor ? [startAfter(cursor)] : []),
      ),
    );
    result.push(...s.docs.map((d) => ({ ...d.data(), id: d.id }) as Deck));
    cursor = s.size === 100 ? s.docs.at(-1) : undefined;
  } while (cursor);
  return result;
}
export async function getVersion(uid: string, deckId: string, id: string) {
  const s = await getDoc(doc(db, `${root(uid)}/decks/${deckId}/versoes/${id}`));
  if (!s.exists()) throw new Error("Versão não encontrada.");
  return { ...s.data(), id: s.id } as Version;
}
export async function saveVersion(
  uid: string,
  nome: string,
  texto: string,
  validacao: Validation,
  deck?: Deck,
) {
  if (!nome.trim() || nome.trim().length > 80) {
    throw new Error("Informe um nome de deck com 1 a 80 caracteres.");
  }
  if (validacao.errors.length || !validacao.entries.length)
    throw new Error("Resolva os erros antes de salvar.");
  const ref = deck
    ? doc(db, `${root(uid)}/decks/${deck.id}`)
    : doc(collection(db, `${root(uid)}/decks`));
  const version = doc(collection(ref, "versoes"));
  await runTransaction(db, async (tx) => {
    let archived = false;
    if (deck) {
      const current = await tx.get(ref);
      if (current.data()?.atual !== deck.atual)
        throw new Error(
          "Deck alterado em outra sessão. Recarregue antes de salvar.",
        );
      archived = current.data()?.arquivado === true;
    }
    tx.set(version, {
      deckId: ref.id,
      texto,
      validacao,
      criadoEm: new Date().toISOString(),
    });
    tx.set(ref, { nome: nome.trim(), atual: version.id, arquivado: archived });
  });
}
export const archiveDeck = (uid: string, deck: Deck) =>
  updateDoc(doc(db, `${root(uid)}/decks/${deck.id}`), {
    arquivado: !deck.arquivado,
  });
export async function renameDeck(uid: string, id: string, nome: string) {
  if (!nome.trim() || nome.trim().length > 80) {
    throw new Error("Informe um nome de deck com 1 a 80 caracteres.");
  }
  await updateDoc(doc(db, `${root(uid)}/decks/${id}`), { nome: nome.trim() });
}
