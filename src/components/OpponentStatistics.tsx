import { useMemo } from "react";
import type { Match } from "../types";
import { opponentGroups } from "../lib/domain";
import { ResultPie } from "./ResultPie";

export function OpponentStatistics({ matches }: { matches: Match[] }) {
  const groups = useMemo(() => opponentGroups(matches), [matches]);
  if (!matches.length) return null;
  return (
    <details className="opponent-statistics">
      <summary>Estatísticas por Deck Adversário</summary>
      <div className="opponent-grid">
        {groups.map((g) => (
          <section className="panel" key={g.value} aria-label={`Resultados contra ${g.label}`}>
            <h4>{g.label}</h4>
            <p className="muted">
              {g.matches.length} {g.matches.length === 1 ? "partida" : "partidas"}
              {g.aliases.length > 1 && ` · Inclui: ${g.aliases.join(", ")}`}
            </p>
            <ResultPie key={g.matches.map((m) => m.placar).join(",")} matches={g.matches} />
          </section>
        ))}
      </div>
    </details>
  );
}
