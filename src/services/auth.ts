import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { clearDataCache } from "./data";
export const login = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email.trim(), password);
export const logout = async () => {
  await signOut(auth);
  clearDataCache();
};
export const resetPassword = (email: string) =>
  sendPasswordResetEmail(auth, email.trim());
export async function changePassword(
  current: string,
  next: string,
  confirmation: string,
) {
  if (next.length < 8)
    throw new Error("Use pelo menos oito caracteres na nova senha.");
  if (next !== confirmation)
    throw new Error("A confirmação não corresponde à nova senha.");
  if (current === next)
    throw new Error("A nova senha deve ser diferente da atual.");
  const user = auth.currentUser;
  if (!user?.email) throw new Error("Entre novamente.");
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, current),
  );
  await updatePassword(user, next);
}
export function errorMessage(error: unknown) {
  const code = (
    error as {
      code?: string;
    }
  ).code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "A senha atual está incorreta.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/user-disabled": "Esta conta foi desativada. Contate o administrador.",
    "auth/requires-recent-login": "Entre novamente antes de alterar sua senha.",
    unavailable:
      "Não foi possível conectar ao Firestore. Verifique sua internet e tente novamente.",
    "auth/too-many-requests":
      "Muitas tentativas. Aguarde antes de tentar novamente.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "permission-denied":
      "Acesso negado. Verifique a autorização de membro e as regras publicadas.",
    "auth/weak-password": "Escolha uma senha mais forte.",
  };
  return (
    (code && messages[code]) ||
    (error instanceof Error
      ? error.message
      : "Não foi possível concluir a operação.")
  );
}
