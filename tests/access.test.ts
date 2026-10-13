import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadAccess,
  normalizeProfileName,
  registerProfileName,
  validProfileName,
} from "../src/lib/access.ts";

const readers = (name: unknown = "Ana") => ({
  membership: async () => ({ ativo: true, senhaTemporaria: false }),
  profile: async () => name,
  passwordAcknowledged: async () => false,
});

test("nomes válidos preservam o limite existente e removem espaços das extremidades", () => {
  assert.equal(normalizeProfileName("  Ana Silva  "), "Ana Silva");
  assert.equal(normalizeProfileName("a".repeat(80)).length, 80);
  for (const value of [
    undefined,
    null,
    42,
    {},
    "",
    "  \t\n ",
    "a".repeat(81),
  ]) {
    assert.equal(validProfileName(value), false);
  }
  for (const value of ["", "   ", "a".repeat(81)])
    assert.throws(() => normalizeProfileName(value));
});

test("acesso exige autorização e nome persistido; senha temporária continua obrigatória", async () => {
  assert.deepEqual(await loadAccess("A", readers()), {
    authorized: true,
    needsName: false,
    temporary: false,
  });
  for (const name of [undefined, "", "   ", 42, "a".repeat(81)]) {
    assert.equal(
      (await loadAccess("A", { ...readers(), profile: async () => name }))
        .needsName,
      true,
    );
  }
  assert.deepEqual(
    await loadAccess("A", {
      ...readers(),
      membership: async () => ({ ativo: true, senhaTemporaria: true }),
    }),
    { authorized: true, needsName: false, temporary: true },
  );
  for (const member of [null, { ativo: false }]) {
    assert.deepEqual(
      await loadAccess("A", {
        ...readers(),
        membership: async () => member,
        profile: async () => {
          assert.fail("Não deve ler perfil de não autorizado");
        },
      }),
      { authorized: false, needsName: true, temporary: false },
    );
  }
});

test("falhas nas leituras de acesso não retornam autorização parcial", async () => {
  const fail = async () => {
    throw new Error("Falha de leitura");
  };
  await assert.rejects(loadAccess("A", { ...readers(), membership: fail }));
  await assert.rejects(loadAccess("A", { ...readers(), profile: fail }));
  await assert.rejects(
    loadAccess("A", {
      ...readers(),
      membership: async () => ({ ativo: true, senhaTemporaria: true }),
      passwordAcknowledged: fail,
    }),
  );
});

test("cadastro só libera acesso após salvar e confirmar o nome persistido do mesmo UID", async () => {
  let stored: unknown;
  const calls: string[] = [];
  const operations = {
    save: async (uid: string, name: string) => {
      calls.push(`save:${uid}`);
      stored = name;
    },
    read: async (uid: string) => {
      calls.push(`read:${uid}`);
      return stored;
    },
  };
  assert.equal(
    (await loadAccess("A", { ...readers(), profile: async () => stored }))
      .needsName,
    true,
  );
  assert.equal(await registerProfileName("A", "  Ana  ", operations), "Ana");
  assert.deepEqual(calls, ["save:A", "read:A"]);
  assert.equal(
    (await loadAccess("A", { ...readers(), profile: async () => stored }))
      .needsName,
    false,
  );
});

test("cadastro rejeita nome inválido, gravação falha, leitura falha e confirmação divergente", async () => {
  await assert.rejects(
    registerProfileName("A", "   ", {
      save: async () => {
        assert.fail("Não deve gravar nome inválido");
      },
      read: async () => "Ana",
    }),
  );
  await assert.rejects(
    registerProfileName("A", "Ana", {
      save: async () => {
        throw new Error("Falha de escrita");
      },
      read: async () => {
        assert.fail("Não deve confirmar escrita falha");
      },
    }),
  );
  await assert.rejects(
    registerProfileName("A", "Ana", {
      save: async () => {},
      read: async () => {
        throw new Error("Falha de leitura");
      },
    }),
  );
  for (const stored of ["", "   ", "Outro nome", undefined]) {
    await assert.rejects(
      registerProfileName("A", "Ana", {
        save: async () => {},
        read: async () => stored,
      }),
    );
  }
});
