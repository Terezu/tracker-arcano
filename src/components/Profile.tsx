import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import { acknowledgePassword, profile, saveProfile } from "../services/data";
import { changePassword, errorMessage } from "../services/auth";
export function Profile({
  user,
  required = false,
  onChanged,
}: {
  user: User;
  required?: boolean;
  onChanged?: () => void;
}) {
  const [name, setName] = useState(""),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(required);
  useEffect(() => {
    if (!required) {
      let active = true;
      profile(user.uid)
        .then((n) => {
          if (active) {
            setName(n);
            setReady(true);
          }
        })
        .catch((e) => {
          if (active) setMessage(errorMessage(e));
        });
      return () => {
        active = false;
      };
    }
  }, [user.uid, required]);
  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await saveProfile(user.uid, name);
      setMessage("Nome atualizado.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await changePassword(current, next, confirm);
      setCurrent("");
      setNext("");
      setConfirm("");
      await acknowledgePassword(user.uid);
      setMessage("Senha alterada.");
      onChanged?.();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-grid">
      {!required && (
        <section className="panel">
          <h2>Meu perfil</h2>
          <p className="muted">{user.email}</p>
          <form onSubmit={saveName}>
            <label>
              Nome de exibição
              <input
                value={name}
                required
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={busy || !ready}>Salvar nome</button>
          </form>
          <p className="muted">
            UID: <code>{user.uid}</code>
          </p>
        </section>
      )}
      <section className="panel">
        <h2>Alterar senha</h2>
        <form onSubmit={savePassword}>
          <label>
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            Confirmar nova senha
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? "Salvando…" : "Alterar senha"}
          </button>
        </form>
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
