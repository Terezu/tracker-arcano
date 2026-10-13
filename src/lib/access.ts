export function validProfileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 80
  );
}

export function normalizeProfileName(value: string) {
  if (!validProfileName(value))
    throw new Error("Informe um nome com 1 a 80 caracteres.");
  return value.trim();
}

interface AccessReaders {
  membership: (
    uid: string,
  ) => Promise<{ ativo: boolean; senhaTemporaria?: boolean } | null>;
  profile: (uid: string) => Promise<unknown>;
  passwordAcknowledged: (uid: string) => Promise<boolean>;
}

// Fail closed: a failed read rejects before any access state is returned.
export async function loadAccess(uid: string, readers: AccessReaders) {
  const member = await readers.membership(uid);
  if (member?.ativo !== true)
    return { authorized: false, needsName: true, temporary: false };
  const name = await readers.profile(uid);
  const temporary =
    member.senhaTemporaria === true &&
    !(await readers.passwordAcknowledged(uid));
  return { authorized: true, needsName: !validProfileName(name), temporary };
}

export async function registerProfileName(
  uid: string,
  value: string,
  operations: {
    save: (uid: string, name: string) => Promise<void>;
    read: (uid: string) => Promise<unknown>;
  },
) {
  const name = normalizeProfileName(value);
  await operations.save(uid, name);
  const persisted = await operations.read(uid);
  if (!validProfileName(persisted) || persisted !== name) {
    throw new Error(
      "Não foi possível confirmar seu nome salvo. Tente novamente.",
    );
  }
  return name;
}
