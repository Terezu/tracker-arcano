import { useMemo, useState } from "react";
import type { Deck, Match } from "../types";
import { statistics } from "../lib/domain";
export function Overview({
  decks,
  matches,
}: {
  decks: Deck[];
  matches: Match[];
}) {
  const [deck, setDeck] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const filtered = useMemo(
    () =>
      matches.filter(
        (m) =>
          (!deck || m.deckId === deck) &&
          (!from || m.data >= from) &&
          (!to || m.data <= to),
      ),
    [matches, deck, from, to],
  );
  const stats = statistics(filtered),
    monthly = new Map<string, Match[]>();
  [...filtered]
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach((m) => {
      const month = m.data.slice(0, 7);
      monthly.set(month, [...(monthly.get(month) || []), m]);
    });
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">VISÃO DO SEU JOGO</p>
          <h2>Visão geral</h2>
          <p className="muted">Inclui decks arquivados e versões anteriores.</p>
        </div>
      </div>
      <section className="panel filters">
        <label>
          Deck
          <select value={deck} onChange={(e) => setDeck(e.target.value)}>
            <option value="">Todos os decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
                {d.arquivado ? " (arquivado)" : ""}
              </option>
            ))}
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
            setDeck("");
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </button>
      </section>
      <div className="stat-grid">
        {[
          ["Partidas", stats.total],
          ["Vitórias", stats.wins],
          ["Derrotas", stats.losses],
          ["Empates", stats.draws],
          ["Vitórias em partidas", `${stats.matchRate.toFixed(1)}%`],
          ["Vitórias em jogos", `${stats.gameRate.toFixed(1)}%`],
        ].map(([label, value]) => (
          <section className="panel stat" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      <p className="muted">
        Jogos individuais: {stats.gamesWon} vencidos · {stats.gamesLost}{" "}
        perdidos · {stats.gamesWon + stats.gamesLost} disputados
      </p>
      {!filtered.length ? (
        <section className="panel empty">
          <h3>A evolução começa com uma partida</h3>
          <p>
            Nenhum resultado neste período. Registre seus jogos na aba Partidas.
          </p>
        </section>
      ) : (
        <div className="chart-grid">
          <section className="panel">
            <h3>Distribuição de resultados</h3>
            <div
              className="distribution"
              role="img"
              aria-label={`${stats.wins} vitórias, ${stats.losses} derrotas e ${stats.draws} empates`}
            >
              {[
                ["wins", stats.wins],
                ["losses", stats.losses],
                ["draws", stats.draws],
              ].map(([key, value]) => (
                <span
                  key={key}
                  className={String(key)}
                  style={{ width: `${(Number(value) / stats.total) * 100}%` }}
                />
              ))}
            </div>
            <ul className="legend">
              <li>🟦 Vitórias: {stats.wins}</li>
              <li>🟥 Derrotas: {stats.losses}</li>
              <li>⬜ Empates: {stats.draws}</li>
            </ul>
          </section>
          <section className="panel">
            <h3>Evolução mensal · vitórias em partidas</h3>
            <div className="evolution">
              {[...monthly.entries()].map(([month, values]) => {
                const s = statistics(values);
                return (
                  <div className="month" key={month}>
                    <span>{month.split("-").reverse().join("/")}</span>
                    <div className="track">
                      <span style={{ width: `${s.matchRate}%` }} />
                    </div>
                    <strong>{s.matchRate.toFixed(1)}%</strong>
                    <small>
                      {s.wins}V / {s.losses}D / {s.draws}E
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
