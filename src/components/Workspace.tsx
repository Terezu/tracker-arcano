import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import type { Deck, Match } from "../types";
import {
  allMatches,
  clearDataCache,
  listDecks,
  matchPage,
} from "../services/data";
import { errorMessage, logout } from "../services/auth";
import { Decks } from "./Decks";
import { Matches } from "./Matches";
import { Overview } from "./Overview";
import { Profile } from "./Profile";
export function Workspace({ user }: { user: User }) {
  const [tab, setTab] = useState("Visão geral"),
    [decks, setDecks] = useState<Deck[]>([]),
    [matches, setMatches] = useState<Match[]>([]),
    [history, setHistory] = useState<Match[]>([]),
    [cursor, setCursor] = useState<QueryDocumentSnapshot>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const [d, m, p] = await Promise.all([
      listDecks(user.uid),
      allMatches(user.uid),
      matchPage(user.uid),
    ]);
    setDecks(d);
    setMatches(m);
    setHistory(p.matches);
    setCursor(p.cursor);
  }, [user.uid]);
  useEffect(() => {
    let active = true;
    Promise.all([
      listDecks(user.uid),
      allMatches(user.uid),
      matchPage(user.uid),
    ])
      .then(([d, m, p]) => {
        if (active) {
          setDecks(d);
          setMatches(m);
          setHistory(p.matches);
          setCursor(p.cursor);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.uid]);
  async function loadMore() {
    const p = await matchPage(user.uid, cursor);
    setHistory((old) => [...old, ...p.matches]);
    setCursor(p.cursor);
  }
  function synchronize() {
    clearDataCache();
    setLoading(true);
    refresh()
      .then(() => setError(""))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }
  return (
    <>
      <nav aria-label="Navegação principal">
        {["Visão geral", "Meus decks", "Partidas", "Perfil"].map((item) => (
          <button
            key={item}
            aria-current={tab === item ? "page" : undefined}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
        <button
          className="logout"
          onClick={() => logout().catch((e) => setError(errorMessage(e)))}
        >
          Sair
        </button>
      </nav>
      <main>
        <div className="sync">
          <button
            className="text-button"
            disabled={loading}
            onClick={synchronize}
          >
            Atualizar dados
          </button>
        </div>
        {error && (
          <div className="notice" role="alert">
            <p>{error}</p>
            <button onClick={synchronize}>Tentar novamente</button>
          </div>
        )}
        {loading ? (
          <p role="status">Carregando seus decks e resultados…</p>
        ) : error ? null : tab === "Visão geral" ? (
          <Overview decks={decks} matches={matches} />
        ) : tab === "Meus decks" ? (
          <Decks uid={user.uid} decks={decks} refresh={refresh} />
        ) : tab === "Partidas" ? (
          <Matches
            uid={user.uid}
            decks={decks}
            matches={history}
            hasMore={!!cursor}
            loadMore={loadMore}
            refresh={refresh}
          />
        ) : (
          <Profile user={user} />
        )}
      </main>
    </>
  );
}
