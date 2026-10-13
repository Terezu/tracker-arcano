import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { completeProfile } from "../services/profile";
import { errorMessage, logout } from "../services/auth";

export function CompleteProfile({
  uid,
  onCompleted,
}: {
  uid: string;
  onCompleted: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await completeProfile(uid, name);
      if (active.current) onCompleted();
    } catch (e) {
      if (active.current) setError(errorMessage(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="panel">
        <h2>Complete seu perfil</h2>
        <p className="muted">
          Antes de continuar, precisamos saber como identificar você nas
          estatísticas das Lontras Arcanas.
        </p>
        <form onSubmit={submit} aria-busy={busy}>
          <label>
            Nome de exibição
            <input
              autoComplete="name"
              required
              maxLength={80}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={
                error ? "profile-registration-error" : undefined
              }
            />
          </label>
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar"}
          </button>
          {busy && <p role="status">Salvando e confirmando seu nome…</p>}
        </form>
        {error && (
          <p id="profile-registration-error" className="notice" role="alert">
            {error}
          </p>
        )}
        <button
          className="secondary"
          onClick={() =>
            logout().catch((e) => {
              if (active.current) setError(errorMessage(e));
            })
          }
        >
          Sair
        </button>
      </section>
    </main>
  );
}
