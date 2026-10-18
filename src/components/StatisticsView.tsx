import { ResultPie } from "./ResultPie";
import type { Match } from "../types";
import { statistics } from "../lib/domain";
export function StatisticsView({
  matches: filtered,
  emptyMessage = "Nenhum resultado neste período. Registre seus jogos na aba Partidas.",
}: {
  matches: Match[];
  emptyMessage?: string;
}) {
  const stats = statistics(filtered),
    monthly = new Map<string, Match[]>();
  [...filtered]
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach((m) => {
      const month = m.data.slice(0, 7);
      const bucket = monthly.get(month) || [];
      bucket.push(m);
      monthly.set(month, bucket);
    });
  return (
    <>
      <div className="stat-grid">
        {[
          ["Partidas", stats.total],
          ["Vitórias", stats.wins],
          ["Derrotas", stats.losses],
          ["Empates", stats.draws],
          ["Vitórias em partidas", `${stats.matchRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`],
          ["Vitórias em jogos", `${stats.gameRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`],
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
          <p>{emptyMessage}</p>
        </section>
      ) : (
        <div className="chart-grid">
          <section className="panel">
            <h3>Distribuição de resultados</h3>
            <ResultPie key={`${stats.wins}/${stats.losses}/${stats.draws}`} matches={filtered} />
          </section>
          <section className="panel">
            <h3>Resultados por mês</h3>
            <div className="evolution">
              {[...monthly.entries()].map(([month, values]) => {
                return (
                  <div className="month" key={month}>
                    <span>{month.split("-").reverse().join("/")}</span>
                    <ResultPie key={values.map(m => m.placar).join(",")} matches={values} />
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
