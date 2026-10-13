import { useState } from "react";
import type { FormEvent } from "react";
import type { Deck } from "../types";
import { palette, textColor, createSession } from "./domain";
import type { LifeSession } from "./domain";
export function Configuration({ decks = [], loadMembers, onStart }: { decks?: Deck[]; loadMembers?: () => Promise<string[]>; onStart: (session: LifeSession) => void }) {
  const [count, setCount] = useState(2), [life, setLife] = useState(20), [poison, setPoison] = useState(10), [deck, setDeck] = useState("");
  const [players, setPlayers] = useState(palette.slice(0,4).map((p,i) => ({ name: `Jogador ${i + 1}`, color: p[1] as string })));
  const [members, setMembers] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const change = (index: number, patch: Partial<(typeof players)[number]>) => setPlayers(old => old.map((p,i) => i === index ? { ...p, ...patch } : p));
  function changeCount(next: number) {
    setCount(next);
    setPlayers(old => {
      const used = new Set<string>();
      return old.map((player, index) => {
        if (index >= next) return player;
        const color = used.has(player.color) ? palette.find(([, candidate]) => !used.has(candidate))![1] : player.color;
        used.add(color);
        return { ...player, color };
      });
    });
  }
  function start(event: FormEvent) {
    event.preventDefault();
    try { onStart(createSession({ initialLife: life, poisonLimit: poison, players: players.slice(0,count), deckId: deck }, crypto.randomUUID())); }
    catch(e) { setError(e instanceof Error ? e.message : "Não foi possível iniciar."); }
  }
  return <form className="life-configuration" onSubmit={start}>
    <section className="panel"><h3>Configurar partida</h3><div className="filters">
      <label>Jogadores<select value={count} onChange={e => changeCount(Number(e.target.value))}>{[2,3,4].map(n => <option key={n} value={n}>{n} jogadores</option>)}</select></label>
      <label>Vida inicial<select value={life} onChange={e => setLife(Number(e.target.value))}>{[20,30,40].map(n => <option key={n} value={n}>{n} vidas</option>)}</select></label>
      <label>Limite de alerta de veneno<input type="number" min={1} step={1} required value={poison} onChange={e => setPoison(Number(e.target.value))} /></label>
    </div><p className="muted">Veneno: 10 por padrão; use 15 para Two-Headed Giant. Os alertas não encerram a partida.</p>
    <label>Seu deck (opcional)<select value={deck} onChange={e => setDeck(e.target.value)}><option value="">Sem deck selecionado</option>{decks.map(d => <option key={d.id} value={d.id}>{d.nome}{d.arquivado ? " (arquivado)" : ""}</option>)}</select></label>
    {loadMembers && <button type="button" className="secondary" disabled={busy} onClick={async () => { setBusy(true); try { setMembers(await loadMembers()); setError(""); } catch { setError("Nomes de membros indisponíveis. Você pode digitar nomes e iniciar normalmente."); } finally { setBusy(false); } }}>{busy ? "Carregando nomes…" : "Carregar nomes dos membros"}</button>}
    </section>
    <div className="life-player-configs">{players.slice(0,count).map((p,i) => <fieldset className="panel" key={i}><legend>Jogador {i + 1}</legend>
      <label>Nome<input required maxLength={80} value={p.name} onChange={e => change(i,{name:e.target.value})} /></label>
      {!!members.length && <label>Usar nome de membro<select value="" onChange={e => { if(e.target.value) change(i,{name:e.target.value}); }}><option value="">Selecionar um nome</option>{members.map((n,index) => <option key={index} value={n}>{n}</option>)}</select></label>}
      <div className="life-color-options" role="group" aria-label={`Cor de ${p.name || `Jogador ${i + 1}`}`}>{palette.map(([label,color]) => <button type="button" key={color} aria-label={label} aria-pressed={p.color === color} disabled={players.slice(0,count).some((other,index) => index !== i && other.color === color)} style={{ backgroundColor: color, color: textColor(color) }} onClick={() => change(i,{color})}>{p.color === color ? "✓" : "●"}</button>)}</div>
    </fieldset>)}</div>
    {error && <p className="notice" role="alert">{error}</p>}
    <button>Iniciar partida</button>
  </form>;
}
