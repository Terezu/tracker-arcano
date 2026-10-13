import type { LifeSession, Player } from "./domain";
import { alerts, textColor } from "./domain";
export function PlayerPanel({ session, player, change, rotate }: { session: LifeSession; player: Player; change: (type: "life" | "poison", playerId: string, amount: number) => void; rotate: () => void }) {
  const warnings = alerts(session,player);
  return <section className="life-player" aria-label={player.name} style={{ backgroundColor: player.color, color: textColor(player.color) }}>
    <div className={`life-player-content${player.rotated ? " rotated" : ""}`}>
      <div className="life-player-heading"><h3>{player.name}</h3><button onClick={rotate} aria-label={`Girar painel de ${player.name}`} aria-pressed={player.rotated}>↻</button></div>
      <output className="life-value" aria-label={`Vida de ${player.name}`}>{player.life}</output>
      <div className="life-adjustments">{[-5,-1,1,5].map(n => <button key={n} aria-label={`${n > 0 ? "Adicionar" : "Remover"} ${Math.abs(n)} ${Math.abs(n) === 1 ? "vida" : "vidas"} de ${player.name}`} onClick={() => change("life",player.id,n)}>{n > 0 ? "+" : "−"}{Math.abs(n)}</button>)}</div>
      <div className="life-poison"><button disabled={!player.poison} aria-label={`Remover veneno de ${player.name}`} onClick={() => change("poison",player.id,-1)}>−</button><span>Veneno <output aria-label={`Veneno de ${player.name}`}>{player.poison}</output> / {session.poisonLimit}</span><button aria-label={`Adicionar veneno a ${player.name}`} onClick={() => change("poison",player.id,1)}>+</button></div>
      {!!warnings.length && <p className="life-alert" role="status">Possível eliminação: {warnings.join(" · ")}</p>}
    </div>
  </section>;
}
