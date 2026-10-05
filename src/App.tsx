import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "./lib/firebase";
import { errorMessage, login, logout, resetPassword } from "./services/auth";
import { membership, passwordAcknowledged } from "./services/data";
import { Profile } from "./components/Profile";
import { Workspace } from "./components/Workspace";
import "./App.css";
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [allowed, setAllowed] = useState(false),
    [temporary, setTemporary] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let generation = 0;
    const cancel = onAuthStateChanged(auth, async (current) => {
      const ticket = ++generation;
      setLoading(true);
      setUser(current);
      setAllowed(false);
      setTemporary(false);
      setMessage("");
      try {
        if (current) {
          const member = await membership(current.uid);
          const pending =
            member?.senhaTemporaria === true &&
            !(await passwordAcknowledged(current.uid));
          if (ticket === generation) {
            setAllowed(member?.ativo === true);
            setTemporary(pending);
          }
        }
      } catch (e) {
        if (ticket === generation) setMessage(errorMessage(e));
      } finally {
        if (ticket === generation) setLoading(false);
      }
    });
    return () => {
      generation++;
      cancel();
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await login(email, password);
      setPassword("");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!email.trim()) {
      setMessage("Preencha seu e-mail para recuperar a senha.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email);
      setMessage(
        "Se a conta puder receber a recuperação, você receberá um e-mail. Confira também o spam.",
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          ✦
        </span>
        <div>
          <p>LONTRAS ARCANAS</p>
          <h1>Tracker Arcano</h1>
        </div>
        <span className="format-tag">PAUPER</span>
      </header>
      {loading ? (
        <main>
          <p role="status">Verificando sessão e autorização…</p>
        </main>
      ) : !user ? (
        <main className="login">
          <section className="panel">
            <p className="eyebrow">SEU PRÓXIMO JOGO COMEÇA AQUI</p>
            <h2>Bem-vindo ao time</h2>
            <p className="muted">
              Entre para acompanhar seus decks e resultados.
            </p>
            <form onSubmit={submit}>
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button disabled={busy}>{busy ? "Aguarde…" : "Entrar"}</button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={reset}
              >
                Recuperar senha
              </button>
            </form>
          </section>
        </main>
      ) : !allowed ? (
        <main className="panel">
          <h2>Acesso aguardando autorização</h2>
          <p>
            Peça ao administrador para autorizar seu UID no cadastro de membros.
          </p>
          <code>{user.uid}</code>
          <p>Depois da autorização, saia e entre novamente.</p>
          <button
            onClick={() => logout().catch((e) => setMessage(errorMessage(e)))}
          >
            Sair
          </button>
        </main>
      ) : temporary ? (
        <main className="panel">
          <h2>Defina sua senha pessoal</h2>
          <p>
            Substitua sua senha temporária para continuar. Esta exigência é
            aplicada pela interface.
          </p>
          <Profile user={user} required onChanged={() => setTemporary(false)} />
          <button
            className="secondary"
            onClick={() => logout().catch((e) => setMessage(errorMessage(e)))}
          >
            Sair
          </button>
        </main>
      ) : (
        <Workspace key={user.uid} user={user} />
      )}{" "}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <footer>Lontras Arcanas · Seu histórico, sua evolução.</footer>
    </div>
  );
}
