import {
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeProfileName, registerProfileName } from "../lib/access";
const root = (uid: string) => `usuarios/${uid}`;
export async function membership(uid: string) {
  const s = await getDoc(doc(db, "membros", uid));
  return s.exists()
    ? (s.data() as {
        ativo: boolean;
        senhaTemporaria?: boolean;
      })
    : null;
}
export async function profile(uid: string) {
  const s = await getDoc(doc(db, root(uid)));
  const name: unknown = s.data()?.nome;
  return typeof name === "string" ? name : "";
}
export async function confirmedProfile(uid: string): Promise<unknown> {
  const s = await getDocFromServer(doc(db, root(uid)));
  return s.data()?.nome;
}
export const completeProfile = (uid: string, name: string) =>
  registerProfileName(uid, name, { save: saveProfile, read: confirmedProfile });
export async function saveProfile(uid: string, nome: string) {
  const name = normalizeProfileName(nome);
  const ref = doc(db, root(uid));
  const s = await getDoc(ref);
  await setDoc(
    ref,
    {
      nome: name,
      atualizadoEm: serverTimestamp(),
      ...(!s.exists() ? { criadoEm: serverTimestamp() } : {}),
    },
    { merge: true },
  );
}
export async function acknowledgePassword(uid: string) {
  await setDoc(doc(db, `${root(uid)}/preferencias/interface`), {
    senhaTrocadaNaInterface: true,
  });
}
export async function passwordAcknowledged(uid: string) {
  return (
    (await getDoc(doc(db, `${root(uid)}/preferencias/interface`))).data()
      ?.senhaTrocadaNaInterface === true
  );
}
