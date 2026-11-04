import { useMemo, useState } from "react";
import type { Deck, Match } from "../types";
import { filterMatches, monthOptions, monthRange, opponentOptions, rangeMonth } from "../lib/domain";
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
  const filtered = useMemo(
    () => filterMatches(matches, { deck, opponent, from, to }),
    [matches, deck, opponent, from, to],
  );
  const opponents = useMemo(
    () => opponentOptions(matches.filter(m => m.deckId === deck)),
    [matches, deck],
  );
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
          <h2>Visão geral</h2>
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
          <select value={opponent} onChange={e => setOpponent(e.target.value)}>
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
      <StatisticsView matches={filtered} />
    </>
  );
}
