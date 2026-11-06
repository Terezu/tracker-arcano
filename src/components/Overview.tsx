import { useMemo, useState } from "react";
import type { Deck, Match } from "../types";
import { filterMatches, monthOptions, monthRange, opponentOptions, rangeMonth, streakItems } from "../lib/domain";
import { OpponentStatistics } from "./OpponentStatistics";
import { Streaks } from "./Streaks";
import { StatisticsView } from "./StatisticsView";
export function Overview({
  decks,
  matches,
}: {
  decks: Deck[];
  matches: Match[];
}) {
  const [opponent, setOpponent] = useState("");
  const [deck, setDeck] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const opponents = useMemo(
    () => opponentOptions(filterMatches(matches, { deck, from, to })),
    [matches, deck, from, to],
  );
  // An opponent with no matches in the selected period falls back to "Geral".
  const activeOpponent = opponents.some(o => o.value === opponent) ? opponent : "";
  const filtered = useMemo(
    () => filterMatches(matches, { deck, opponent: activeOpponent, from, to }),
    [matches, deck, activeOpponent, from, to],
  );
  const streaks = useMemo(() => streakItems(decks, matches, { deck, from, to }), [decks, matches, deck, from, to]);
  // The month is derived from De/Até, so the three fields can never disagree.
  const month = rangeMonth(from, to);
  const months = useMemo(
    () => monthOptions(deck ? matches.filter(m => m.deckId === deck) : matches, month),
    [matches, deck, month],
  );
  function selectMonth(value: string) {
    const range = value ? monthRange(value) : { from: "", to: "" };
    setFrom(range.from);
    setTo(range.to);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">VISÃO DO SEU JOGO</p>
          <h2>Visão Geral</h2>
          <p className="muted">Inclui decks arquivados e versões anteriores.</p>
        </div>
      </div>
      <section className="panel filters">
        <label>
          Deck
          <select value={deck} onChange={(e) => { setDeck(e.target.value); setOpponent(""); }}>
            <option value="">Todos os decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
                {d.arquivado ? " (arquivado)" : ""}
              </option>
            ))}
          </select>
        </label>
        {deck && <label>Deck adversário
          <select value={activeOpponent} onChange={e => setOpponent(e.target.value)}>
            <option value="">Geral</option>
            {opponents.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>}
        <label>
          Mês
          <select value={month} onChange={(e) => selectMonth(e.target.value)}>
            <option value="">{from || to ? "Período personalizado" : "Todos os meses"}</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
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
            setOpponent("");
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </button>
      </section>
      <Streaks items={streaks} />
      <StatisticsView matches={filtered} />
      {deck && !activeOpponent && <OpponentStatistics matches={filtered} />}
    </>
  );
}
