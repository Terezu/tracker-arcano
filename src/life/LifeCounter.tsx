import { useEffect, useRef, useState } from "react";
import type { Deck } from "../types";
import { changeCounters, restartSession, rotatePlayer, undoLast } from "./domain";
import type { LifeSession } from "./domain";
import { clearSession, readSession, saveSession } from "./storage";
import { Configuration } from "./Configuration";
import { PlayerPanel } from "./PlayerPanel";
import { CommanderControls } from "./CommanderControls";
import { History } from "./History";
import { Tools } from "./Tools";
import { prepareOffline } from "./offline";
import { iphoneSafari, standaloneMode } from "./presentation";
import "./life.css";

export function LifeCounter({ decks, loadMembers, onRegister, isolated = false }: { decks?: Deck[]; loadMembers?: () => Promise<string[]>; onRegister?: (deckId: string) => void; isolated?: boolean }) {
  const [initial] = useState(() => { try { return { saved: readSession(), error: "" }; } catch(e) { return { saved: null, error: e instanceof Error ? e.message : "Armazenamento local indisponível." }; } });
  const [saved, setSaved] = useState(initial.saved);
  const [session, setSession] = useState<LifeSession | null>(null);
  const latest = useRef<LifeSession | null>(null);
  const [message, setMessage] = useState(initial.error), [storageError, setStorageError] = useState(initial.error);
  const [focused, setFocused] = useState(false), [fullscreen, setFullscreen] = useState(false);
  const [standalone, setStandalone] = useState(standaloneMode);
  const [installDismissed, setInstallDismissed] = useState(false);
  const fullscreenSupported = typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled === true;
  const [online, setOnline] = useState(navigator.onLine), [offlineStatus, setOfflineStatus] = useState("");
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const full = () => setFullscreen(document.fullscreenElement === root.current);
    window.addEventListener("online",connection); window.addEventListener("offline",connection);
    document.addEventListener("fullscreenchange",full);
    return () => { window.removeEventListener("online",connection); window.removeEventListener("offline",connection); document.removeEventListener("fullscreenchange",full); };
  }, []);
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const changed = () => setStandalone(standaloneMode());
    display.addEventListener("change", changed);
    window.addEventListener("pageshow", changed);
    return () => { display.removeEventListener("change", changed); window.removeEventListener("pageshow", changed); };
  }, []);
  useEffect(() => {
    if (!focused && !fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [focused, fullscreen]);
  useEffect(() => {
    const element = root.current;
    const board = element?.querySelector<HTMLElement>(".life-board");
    if (!element || !board || (!focused && !fullscreen)) return;
    const measure = () => {
      const actions = element.querySelector<HTMLElement>(".life-session-actions");
      const top = board.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
      const bottom = parseFloat(getComputedStyle(element).paddingBottom);
      const available = element.clientHeight - top - bottom - (actions?.offsetHeight ?? 44) - 28;
      element.style.setProperty("--life-board-space", `${Math.max(0, available)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const item of element.querySelectorAll(".life-topbar, .life-install, .notice, .life-session-actions")) observer.observe(item);
    window.visualViewport?.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener("resize", measure); element.style.removeProperty("--life-board-space"); };
  }, [focused, fullscreen, session?.players.length, session?.ended, message, storageError, installDismissed, online]);
  function persist(value: LifeSession) {
    try { saveSession(value); setStorageError(""); }
    catch { setStorageError("Não foi possível salvar no dispositivo. Os controles continuam em memória; tente salvar novamente antes de fechar."); }
  }
  function commit(value: LifeSession) { latest.current = value; setSession(value); setSaved(value); persist(value); }
  function update(operation: (state: LifeSession) => LifeSession) {
    if (!latest.current) return;
    try { commit(operation(latest.current)); setMessage(""); }
    catch(e) { setMessage(e instanceof Error ? e.message : "Não foi possível ajustar."); }
  }
  function start(value: LifeSession) {
    if ((saved || initial.error) && !window.confirm("Substituir a sessão local anterior?")) return;
    commit(value); setMessage(""); setFocused(true);
  }
  function configure() {
    if (!window.confirm("Encerrar esta sessão e voltar à configuração? A sessão local e seu histórico serão removidos.")) return;
    try { clearSession(); latest.current = null; setSession(null); setSaved(null); setStorageError(""); setMessage(""); setFocused(false); }
    catch { setStorageError("Não foi possível remover a sessão local. Tente novamente."); }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else if (fullscreenSupported && root.current) await root.current.requestFullscreen();
      else setFocused(value => !value);
    } catch { setFocused(true); setMessage("O navegador recusou tela cheia. Modo imersivo ativado; as barras do navegador podem continuar visíveis."); }
  }
  return <section ref={root} className={`life-root${focused ? " life-focused" : ""}${session && !session.ended ? " life-running" : ""}`} aria-label="Marcador de Vida">
    <div className="life-topbar"><h2>Marcador de Vida</h2><div className="life-top-actions">
      {session && <button className="secondary" onClick={async () => { if(fullscreen) await toggleFullscreen(); setFocused(value => !value); }}>{focused ? "Sair do modo imersivo" : "Modo imersivo"}</button>}
      {fullscreenSupported && !standalone ? <button className="secondary" onClick={toggleFullscreen}>{fullscreen ? "Sair da tela cheia" : "Tela cheia"}</button> : !session && <button className="secondary" onClick={() => setFocused(value => !value)}>{focused ? "Sair do modo imersivo" : "Modo imersivo"}</button>}
    </div></div>
    {iphoneSafari() && !standalone && !installDismissed && <details className="life-install"><summary>Usar sem as barras do Safari</summary><p>Para usar o marcador sem as barras do Safari, adicione o Tracker Arcano à Tela de Início.</p><p>Abra <a href="/marcador.html">o marcador</a>, toque em Compartilhar no Safari e selecione “Adicionar à Tela de Início”. Depois, abra pelo ícone. Prepare e confira a sessão nesse modo antes de jogar offline.</p><button className="secondary" onClick={() => setInstallDismissed(true)}>Dispensar orientação</button></details>}
    {!online && <p className="muted">Sem conexão · marcador local disponível. Registro de resultados exige internet.</p>}
    {message && <p className="notice" role="alert">{message}</p>}
    {storageError && <div className="notice" role="alert"><p>{storageError}</p>{session && <button onClick={() => persist(latest.current!)}>Salvar novamente</button>}</div>}
    {!session ? <>
      <p className="muted">Vida, veneno e comandante são salvos somente neste dispositivo. Nenhum resultado é enviado automaticamente ao Tracker Arcano.</p>
      {saved && <section className="panel"><h3>Sessão anterior</h3><p>{saved.players.map(p => p.name).join(" · ")}{saved.ended ? " · Encerrada" : ""}</p><button onClick={() => { latest.current = saved; setSession(saved); setFocused(true); }}>Retomar sessão</button><button className="secondary" onClick={configure}>Descartar e configurar novamente</button></section>}
      <Configuration decks={decks} loadMembers={loadMembers} onStart={start} />
      <div className="panel"><h3>Preparar uso offline</h3><p>Prepare com internet e abra a página isolada uma vez. Ela não dá acesso a perfis, decks ou estatísticas.</p><button onClick={async () => { setOfflineStatus("Preparando…"); try { await prepareOffline(); setOfflineStatus("Arquivos prontos. Abra o marcador offline para conferir a sessão."); } catch(e) { setOfflineStatus(e instanceof Error ? e.message : "Não foi possível preparar offline."); } }}>Preparar arquivos offline</button><p role="status">{offlineStatus}</p><a href="/marcador.html">Abrir marcador isolado/offline</a></div>
    </> : <>
      {!session.ended ? <>
        <div className={`life-board players-${session.players.length}`}>{session.players.map(player => <PlayerPanel key={player.id} session={session} player={player} rotate={() => update(s => rotatePlayer(s,player.id))} change={(type,playerId,value) => update(s => changeCounters(s,{type,playerId,value},crypto.randomUUID(),new Date().toISOString()))} />)}</div>
        <div className="life-session-actions"><button disabled={!session.undo.length} onClick={() => update(s => undoLast(s,crypto.randomUUID(),new Date().toISOString()))}>Desfazer última alteração</button><button className="secondary" onClick={() => { if(window.confirm("Encerrar esta partida? Nenhum resultado será salvo automaticamente.")) update(s => ({ ...s, ended:true })); }}>Encerrar partida</button></div>
        <CommanderControls session={session} update={update} />
        <Tools />
      </> : <section className="panel life-ended"><h3>Partida encerrada</h3><p>Nenhum resultado foi registrado. Preencha data e placar manualmente no Tracker Arcano; a vida final não determina o vencedor.</p><ul>{session.players.map(p => <li key={p.id}>{p.name}: {p.life} vidas · {p.poison} venenos</li>)}</ul>
        {onRegister && online ? <button onClick={() => { if(window.confirm("Abrir o formulário de Partidas? Você ainda precisará preencher o placar e confirmar o salvamento.")) onRegister(session.deckId); }}>Registrar resultado manualmente</button> : <p className="muted">Para registrar depois, conecte-se, entre no Tracker Arcano e use a aba Partidas. Esta sessão continuará localmente como referência; nenhum resultado pendente foi criado.</p>}
        <button className="secondary" onClick={() => { setFocused(false); setMessage("Partida encerrada sem registro. O resumo permanece salvo neste dispositivo."); }}>Encerrar sem registrar</button>
      </section>}
      <History session={session} />
      <details className="life-disclosure"><summary>Reiniciar ou configurar</summary><div className="actions"><button className="secondary" onClick={() => { if(window.confirm("Reiniciar? Vida inicial será restaurada e contadores e histórico serão zerados. Jogadores, cores, rotação e comandantes serão mantidos.")) update(s => restartSession(s,crypto.randomUUID())); }}>Reinício rápido</button><button className="secondary" onClick={configure}>Nova configuração</button></div></details>
    </>}
    {isolated && <p className="muted life-isolated-note">Modo local isolado · nenhuma sessão local autoriza acesso aos dados do time. <a href="/">Entrar no Tracker Arcano</a></p>}
  </section>;
}
