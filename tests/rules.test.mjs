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
  serverTimestamp,
  getDocFromServer,
  where,
  orderBy,
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
  await assertSucceeds(
    getDoc(doc(env.authenticatedContext("B").firestore(), path)),
  );
  await assertFails(
    setDoc(
      doc(
        env.authenticatedContext("B").firestore(),
        "usuarios/A/partidas/intruso",
      ),
      match(),
    ),
  );
  for (const ctx of [
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

test("consulta do time é limitada a ativos e preserva escrita e dados privados", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "usuarios/A"), { nome: "Ana" });
    await setDoc(doc(db, "usuarios/inativo"), { nome: "Inativo" });
    await setDoc(doc(db, "usuarios/A/preferencias/interface"), {
      senhaTrocadaNaInterface: true,
    });
  });
  const db = env.authenticatedContext("B").firestore();
  const members = await assertSucceeds(
    getDocs(
      query(
        collection(db, "membros"),
        where("ativo", "==", true),
        orderBy("__name__"),
        limit(100),
      ),
    ),
  );
  assert.deepEqual(
    members.docs.map((d) => d.id),
    ["A", "B"],
  );
  await assertFails(
    getDocs(
      query(collection(db, "membros"), where("ativo", "==", true), limit(101)),
    ),
  );
  await assertSucceeds(getDoc(doc(db, "usuarios/A")));
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "usuarios/A/decks"),
        orderBy("__name__"),
        limit(100),
      ),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "usuarios/A/partidas"),
        orderBy("data", "desc"),
        orderBy("__name__", "desc"),
        limit(50),
      ),
    ),
  );
  await assertFails(getDoc(doc(db, "usuarios/inativo")));
  await assertFails(
    getDocs(query(collection(db, "usuarios/inativo/partidas"), limit(50))),
  );
  await assertFails(getDoc(doc(db, `${path}/versoes/v1`)));
  await assertFails(getDoc(doc(db, "usuarios/A/preferencias/interface")));
  await assertFails(updateDoc(doc(db, "usuarios/A"), { nome: "Intruso" }));
  await assertFails(updateDoc(doc(db, path), { nome: "Intruso" }));
  await assertFails(
    updateDoc(doc(db, "usuarios/A/partidas/m1"), { placar: "0-2" }),
  );
  await assertFails(deleteDoc(doc(db, "usuarios/A/partidas/m1")));
  for (const ctx of [
    env.authenticatedContext("C"),
    env.authenticatedContext("inativo"),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(
      getDocs(
        query(
          collection(ctx.firestore(), "membros"),
          where("ativo", "==", true),
          limit(100),
        ),
      ),
    );
  }
});

test("cadastro do próprio nome preserva histórico, perfil e autorização", async () => {
  const db = env.authenticatedContext("A").firestore();
  const ref = doc(db, "usuarios/A");
  const deckBefore = (await getDoc(doc(db, path))).data();
  const matchBefore = (await getDoc(doc(db, "usuarios/A/partidas/m1"))).data();
  const versionBefore = (await getDoc(doc(db, `${path}/versoes/v1`))).data();
  const membershipBefore = (await getDoc(doc(db, "membros/A"))).data();
  await assertFails(
    setDoc(ref, {
      nome: "",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(ref, {
      nome: "a".repeat(81),
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(
      ref,
      {
        nome: "Ana Silva",
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    ),
  );
  const saved = (await getDocFromServer(ref)).data();
  assert.equal(saved.nome, "Ana Silva");
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "usuarios/A"), {
      legado: "preservado",
    });
  });
  await assertSucceeds(
    setDoc(
      ref,
      { nome: "Ana", atualizadoEm: serverTimestamp() },
      { merge: true },
    ),
  );
  const updated = (await getDocFromServer(ref)).data();
  assert.equal(updated.nome, "Ana");
  assert.equal(updated.legado, "preservado");
  assert.deepEqual(updated.criadoEm, saved.criadoEm);
  assert.deepEqual((await getDoc(doc(db, path))).data(), deckBefore);
  assert.deepEqual(
    (await getDoc(doc(db, "usuarios/A/partidas/m1"))).data(),
    matchBefore,
  );
  assert.deepEqual(
    (await getDoc(doc(db, `${path}/versoes/v1`))).data(),
    versionBefore,
  );
  assert.deepEqual(
    (await getDoc(doc(db, "membros/A"))).data(),
    membershipBefore,
  );
  await assertFails(
    updateDoc(doc(env.authenticatedContext("B").firestore(), "usuarios/A"), {
      nome: "Intruso",
      atualizadoEm: serverTimestamp(),
    }),
  );
  for (const uid of ["C", "inativo"]) {
    await assertFails(
      setDoc(
        doc(env.authenticatedContext(uid).firestore(), `usuarios/${uid}`),
        {
          nome: "Teste",
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        },
      ),
    );
  }
});

test("optional opponent supports legacy, creation, edit, removal and rejects invalid values", async () => {
  const db = env.authenticatedContext("A").firestore();
  const ref = doc(db,"usuarios/A/partidas/opponent");
  await assertSucceeds(setDoc(ref,match({deckAdversario:"Krenko"})));
  await assertSucceeds(updateDoc(ref,{deckAdversario:"Edgar Markov"}));
  assert.equal((await getDoc(ref)).data().deckAdversario,"Edgar Markov");
  await assertSucceeds(setDoc(ref,match()));
  assert.equal("deckAdversario" in (await getDoc(ref)).data(),false);
  for (const value of [null,42,"", "x".repeat(201)]) await assertFails(setDoc(ref,match({deckAdversario:value})));
  await assertSucceeds(updateDoc(doc(db,"usuarios/A/partidas/m1"),{deckAdversario:"Yuriko"}));
  await assertFails(updateDoc(doc(env.authenticatedContext("B").firestore(),"usuarios/A/partidas/m1"),{deckAdversario:"Krenko"}));
});
