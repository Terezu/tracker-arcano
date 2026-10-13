import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { profile } from "./profile";
import { listDecks } from "./decks";
import { allMatches } from "./matches";
import type { Deck, Match } from "../types";
export interface TeamMember {
  uid: string;
  nome: string;
  decks: Deck[];
  matches: Match[];
}
// Read-only queries; reuse the complete paginated match cache.
export async function loadTeam(): Promise<TeamMember[]> {
  const members: TeamMember[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const page = await getDocs(
      query(
        collection(db, "membros"),
        where("ativo", "==", true),
        orderBy("__name__"),
        limit(100),
        ...(cursor ? [startAfter(cursor)] : []),
      ),
    );
    for (const member of page.docs) {
      const [nome, decks, matches] = await Promise.all([
        profile(member.id),
        listDecks(member.id),
        allMatches(member.id),
      ]);
      members.push({
        uid: member.id,
        nome: nome || "Membro sem nome cadastrado",
        decks,
        matches,
      });
    }
    cursor = page.size === 100 ? page.docs.at(-1) : undefined;
  } while (cursor);
  return members.sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR") || a.uid.localeCompare(b.uid),
  );
}
