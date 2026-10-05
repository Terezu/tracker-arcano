import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
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
  return (s.data()?.nome as string) || "";
}
export async function saveProfile(uid: string, nome: string) {
  if (!nome.trim() || nome.trim().length > 80) {
    throw new Error("Informe um nome com 1 a 80 caracteres.");
  }
  const ref = doc(db, root(uid));
  const s = await getDoc(ref);
  await setDoc(
    ref,
    {
      nome: nome.trim(),
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
