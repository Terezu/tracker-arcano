import { useState } from "react";
import type { Commander, LifeSession } from "./domain";
import { addCommander, changeController, changeCounters } from "./domain";
export function CommanderControls({ session, update }: { session: LifeSession; update: (operation: (state: LifeSession) => LifeSession) => void }) {
  const label = (c: Commander) => `${c.name} · ${session.players.find(p => p.id === c.ownerId)?.name} · #${session.commanders.findIndex(other => other.id === c.id) + 1}`;
  const [name, setName] = useState(""), [owner, setOwner] = useState(session.players[0].id);
  const [commander, setCommander] = useState(session.commanders[0]?.id || ""), [target, setTarget] = useState(session.players[1].id), [amount, setAmount] = useState(1), [total, setTotal] = useState(0);
  return <details className="life-disclosure"><summary>Dano de comandante</summary>
    <label className="life-checkbox"><input type="checkbox" checked={session.commanderEnabled} onChange={e => update(s => ({ ...s, commanderEnabled: e.target.checked }))} />Ativar controle de comandante</label>
    <p className="muted">Apenas dano de combate. Cada comandante mantém sua identidade mesmo ao mudar de controlador. Alertas de 21 pontos são separados por comandante.</p>
    <form className="filters" onSubmit={e => { e.preventDefault(); const id = crypto.randomUUID(); update(s => addCommander(s,owner,name,id)); setCommander(id); setName(""); }}>
      <label>Jogador de origem<select value={owner} onChange={e => setOwner(e.target.value)}>{session.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Nome do comandante<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><button>Adicionar comandante</button>
    </form>
    {session.commanders.map(c => <div className="life-commander" key={c.id}><strong>{label(c)}</strong><label>Controlador atual<select value={c.controllerId} onChange={e => update(s => changeController(s,c.id,e.target.value))}>{session.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>)}
    {!!session.commanders.length && <>
      <div className="filters"><label>Comandante causador<select value={commander} onChange={e => setCommander(e.target.value)}><option value="">Selecione</option>{session.commanders.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}</select></label><label>Jogador que recebeu<select value={target} onChange={e => setTarget(e.target.value)}>{session.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      <p>Total recebido deste comandante: {session.damage[target][commander] || 0}</p>
      <form className="filters" onSubmit={e => { e.preventDefault(); update(s => changeCounters(s,{ type:"combat", playerId:target, commanderId:commander, value:amount },crypto.randomUUID(),new Date().toISOString())); }}><label>Novo dano de combate<input type="number" required min={1} step={1} value={amount} onChange={e => setAmount(Number(e.target.value))} /></label><button disabled={!session.commanderEnabled || !commander}>Registrar dano e descontar vida</button></form>
      <form className="filters" onSubmit={e => { e.preventDefault(); update(s => changeCounters(s,{ type:"correction", playerId:target, commanderId:commander, value:total },crypto.randomUUID(),new Date().toISOString())); }}><label>Corrigir total (sem alterar vida)<input type="number" required min={0} step={1} value={total} onChange={e => setTotal(Number(e.target.value))} /></label><button className="secondary" disabled={!session.commanderEnabled || !commander}>Corrigir somente contador</button></form>
      <ul>{session.players.flatMap(p => session.commanders.map(c => <li key={`${p.id}-${c.id}`}>{p.name} · {label(c)}: {session.damage[p.id][c.id] || 0}</li>))}</ul>
    </>}
  </details>;
}
