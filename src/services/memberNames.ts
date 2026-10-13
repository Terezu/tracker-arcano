import { collection, getDocs, limit, orderBy, query, startAfter, where } from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { profile } from "./profile";
// Optional reads of display names only; no match/deck scan and no private preferences.
export async function listMemberNames() {
  const names: string[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const page = await getDocs(query(collection(db,"membros"),where("ativo","==",true),orderBy("__name__"),limit(100),...(cursor ? [startAfter(cursor)] : [])));
    for (const member of page.docs) { const name = await profile(member.id); if(name.trim()) names.push(name); }
    cursor = page.size === 100 ? page.docs.at(-1) : undefined;
  } while(cursor);
  return names.sort((a,b) => a.localeCompare(b,"pt-BR"));
}
