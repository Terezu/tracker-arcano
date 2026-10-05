import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
let env;
const stamp = "2026-10-05T12:00:00.000Z";
const version = (id = "d") => ({
  deckId: id,
  texto: "60 Mountain",
  validacao: {
    entries: [{ name: "Mountain", quantity: 60, board: "main" }],
    errors: [],
    checkedAt: stamp,
  },
  criadoEm: stamp,
});
const match = (extra = {}) => ({
  deckId: "d",
  versaoId: "v1",
  data: "2026-10-05",
  placar: "2-0",
  criadoEm: stamp,
  ...extra,
});
const path = "usuarios/A/decks/d";
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-tracker-arcano",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "membros/A"), { ativo: true });
    await setDoc(doc(db, "membros/B"), { ativo: true });
    await setDoc(doc(db, "membros/inativo"), { ativo: false });
    await setDoc(doc(db, path), {
      nome: "Burn",
      atual: "v1",
      arquivado: false,
    });
    await setDoc(doc(db, `${path}/versoes/v1`), version());
    await setDoc(doc(db, "usuarios/A/partidas/m1"), match());
  });
});
test("titular autorizado lê; B, não autorizado e anônimo não acessam A", async () => {
  await assertSucceeds(
    getDoc(doc(env.authenticatedContext("A").firestore(), path)),
  );
  for (const ctx of [
    env.authenticatedContext("B"),
    env.authenticatedContext("C"),
    env.authenticatedContext("inativo"),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(ctx.firestore(), path)));
    await assertFails(
      setDoc(doc(ctx.firestore(), "usuarios/A/partidas/intruso"), match()),
    );
  }
  await assertFails(
    getDoc(doc(env.authenticatedContext("C").firestore(), "usuarios/C")),
  );
});
test("membros não podem conceder autorização nem listar outros membros", async () => {
  const db = env.authenticatedContext("A").firestore();
  await assertFails(
    setDoc(doc(db, "membros/A"), { ativo: true, senhaTemporaria: false }),
  );
  await assertFails(setDoc(doc(db, "membros/C"), { ativo: true }));
  await assertFails(getDocs(collection(db, "membros")));
});
test("versões e decks não podem ser destruídos; nova versão é atômica e preserva partidas", async () => {
  const db = env.authenticatedContext("A").firestore();
  await assertFails(
    updateDoc(doc(db, `${path}/versoes/v1`), { texto: "61 Mountain" }),
  );
  await assertFails(deleteDoc(doc(db, `${path}/versoes/v1`)));
  await assertFails(deleteDoc(doc(db, path)));
  await assertFails(setDoc(doc(db, `${path}/versoes/v2`), version()));
  await assertFails(updateDoc(doc(db, path), { atual: "missing" }));
  const batch = writeBatch(db);
  batch.set(doc(db, `${path}/versoes/v2`), {
    ...version(),
    texto: "61 Mountain",
  });
  batch.update(doc(db, path), { atual: "v2" });
  await assertSucceeds(batch.commit());
  assert.equal(
    (await getDoc(doc(db, "usuarios/A/partidas/m1"))).data().versaoId,
    "v1",
  );
  assert.equal(
    (await getDoc(doc(db, `${path}/versoes/v1`))).data().texto,
    "60 Mountain",
  );
  await assertFails(updateDoc(doc(db, path), { atual: "v1" }));
  await assertSucceeds(
    updateDoc(doc(db, path), { nome: "Novo nome", arquivado: true }),
  );
  assert.equal(
    (await getDoc(doc(db, "usuarios/A/partidas/m1"))).data().versaoId,
    "v1",
  );
});
test("placares, datas, referências e campos são validados; correção preserva referências", async () => {
  const db = env.authenticatedContext("A").firestore();
  for (const placar of ["2-0", "2-1", "1-1", "1-2", "0-2", "1-0", "0-1", "0-0"])
    await assertSucceeds(
      setDoc(doc(db, `usuarios/A/partidas/score${placar}`), match({ placar })),
    );
  for (const extra of [
    { placar: "3-0" },
    { data: "2026-02-29" },
    { data: "2026-04-31" },
    { versaoId: "missing" },
    { deckId: "other" },
    { extra: true },
  ])
    await assertFails(setDoc(doc(db, "usuarios/A/partidas/bad"), match(extra)));
  await assertSucceeds(
    setDoc(doc(db, "usuarios/A/partidas/leap"), match({ data: "2024-02-29" })),
  );
  await assertFails(
    updateDoc(doc(db, "usuarios/A/partidas/m1"), { versaoId: "v2" }),
  );
  await assertFails(
    updateDoc(doc(db, "usuarios/A/partidas/m1"), {
      criadoEm: "2026-10-06T12:00:00.000Z",
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db, "usuarios/A/partidas/m1"), { placar: "1-1" }),
  );
  await assertSucceeds(deleteDoc(doc(db, "usuarios/A/partidas/m1")));
  await assertSucceeds(updateDoc(doc(db, path), { arquivado: true }));
  await assertFails(setDoc(doc(db, "usuarios/A/partidas/archived"), match()));
});
test("consultas exigem limites e preferências não concedem autorização", async () => {
  const db = env.authenticatedContext("A").firestore();
  await assertFails(getDocs(collection(db, "usuarios/A/partidas")));
  await assertSucceeds(
    getDocs(query(collection(db, "usuarios/A/partidas"), limit(50))),
  );
  await assertSucceeds(
    setDoc(doc(db, "usuarios/A/preferencias/interface"), {
      senhaTrocadaNaInterface: true,
    }),
  );
  await assertFails(
    setDoc(doc(db, "usuarios/A/preferencias/interface"), {
      senhaTrocadaNaInterface: true,
      ativo: true,
    }),
  );
});
