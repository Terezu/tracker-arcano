import { useEffect, useMemo, useState } from "react";
import { loadTeam } from "../services/team";
import type { TeamMember } from "../services/team";
import { errorMessage } from "../services/auth";
import { teamResults, opponentOptions } from "../lib/domain";
import { StatisticsView } from "./StatisticsView";
export function TeamStatistics() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [opponent, setOpponent] = useState("");
  const [member, setMember] = useState(""),
    [deck, setDeck] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  useEffect(() => {
    let active = true;
    loadTeam()
      .then((data) => {
        if (active) {
          setMembers(data);
          setError("");
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
  }, [attempt]);
  const results = useMemo(
    () => teamResults(members, { member, deck, opponent, from, to }),
    [members, member, deck, opponent, from, to],
  );
  const opponents = useMemo(
    () => opponentOptions(members.flatMap(m => m.matches)),
    [members],
  );
  if (loading) return <p role="status">Carregando estatísticas do time…</p>;
  if (error)
    return (
      <div className="notice" role="alert">
        <p>{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setAttempt((a) => a + 1);
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">LONTRAS ARCANAS</p>
          <h2>Estatísticas do Time</h2>
          <p className="muted">
            Consulta dos membros ativos. Inclui decks arquivados e todas as
            versões.
          </p>
        </div>
      </div>
      <section className="panel filters" aria-label="Filtros do time">
        <label>
          Membro
          <select
            value={member}
            onChange={(e) => {
              setMember(e.target.value);
              setDeck("");
            }}
          >
            <option value="">Todos os membros</option>
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deck
          <select
            disabled={!member}
            value={deck}
            onChange={(e) => setDeck(e.target.value)}
          >
            <option value="">Todos os decks</option>
            {members
              .find((m) => m.uid === member)
              ?.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                  {d.arquivado ? " (arquivado)" : ""}
                </option>
              ))}
          </select>
        </label>
        <label>Deck adversário
          <select value={opponent} onChange={e => setOpponent(e.target.value)}>
            <option value="">Todos os decks adversários</option>
            {opponents.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            setMember("");
            setOpponent("");
            setDeck("");
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </button>
      </section>
      <h3>Estatísticas Gerais do Time</h3>
      <p className="muted">
        Cada registro de partida de um membro conta uma vez. Os filtros se
        aplicam ao consolidado e aos membros abaixo.
      </p>
      <StatisticsView
        matches={results.matches}
        emptyMessage="Nenhuma partida do time nos filtros selecionados."
      />
      <details className="member-statistics">
        <summary>Estatísticas por Membro</summary>
        {!results.individual.length && (
          <p className="muted">Nenhum membro encontrado.</p>
        )}
        {results.individual.map((m) => (
          <section key={m.uid} aria-label={`Estatísticas de ${m.nome}`}>
            <h4>{m.nome}</h4>
            <StatisticsView
              matches={m.matches}
              emptyMessage="Este membro não possui partidas nos filtros selecionados."
            />
          </section>
        ))}
      </details>
    </>
  );
}
