import type { LifeSession } from "./domain";
const labels = { life: "Vida", poison: "Veneno", combat: "Dano de comandante", correction: "Correção de dano", undo: "Desfazer" };
export function History({ session }: { session: LifeSession }) {
  return <details className="life-disclosure"><summary>Histórico · {session.history.length} alterações</summary>
    {!session.history.length ? <p>Nenhuma alteração registrada.</p> : <ol className="life-history">{[...session.history].reverse().map(e => <li key={e.id}><strong>{session.players.find(p => p.id === e.playerId)?.name} · {labels[e.type]}</strong><time dateTime={e.at}>{new Date(e.at).toLocaleString("pt-BR")}</time>{e.source && <span>Origem: {e.source}</span>}<span>{e.changes.map(c => `${c.field === "life" ? "Vida" : c.field === "poison" ? "Veneno" : "Dano"}: ${c.before} → ${c.after}`).join(" · ")}</span></li>)}</ol>}
  </details>;
}
