import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { scores } from "../types";
import type { Deck, Match, Score, Version } from "../types";
import { localToday, opponentOptions } from "../lib/domain";
import { deleteMatch, getVersion, saveMatch } from "../services/data";
import { errorMessage } from "../services/auth";
import { CardList } from "./Decks";
export function Matches({
  uid,
  decks,
  matches,
  suggestionMatches = matches,
  hasMore,
  loadMore,
  refresh,
  initialDeckId = "",
  requireConfirmation = false,
}: {
  uid: string;
  decks: Deck[];
  matches: Match[];
  suggestionMatches?: Match[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  initialDeckId?: string;
  requireConfirmation?: boolean;
}) {
  const [deckId, setDeckId] = useState(() => decks.some(d => d.id === initialDeckId && !d.arquivado) ? initialDeckId : ""),
    [date, setDate] = useState(localToday()),
    [score, setScore] = useState<Score>("2-0"),
    [editing, setEditing] = useState<Match>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [version, setVersion] = useState<Version>();
  const [opponent, setOpponent] = useState("");
  const suggestions = useMemo(() => opponentOptions(suggestionMatches), [suggestionMatches]);
  const active = decks.filter((d) => !d.arquivado);
  const saving = useRef(false);
  async function action(work: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await action(async () => {
      const d = active.find((d) => d.id === deckId);
      if (!editing && !d) throw new Error("Selecione um deck ativo.");
      if (editing && !window.confirm("Confirmar correção desta partida?"))
        return;
      if (!editing && requireConfirmation) {
        if (!navigator.onLine) throw new Error("O registro exige conexão. Nenhum resultado foi colocado em fila.");
        if (!window.confirm(`Confirmar registro manual de ${d!.nome}, data ${date}, placar ${score}?`)) return;
      }
      await saveMatch(
        uid,
        {
          deckId: editing?.deckId || d!.id,
          versaoId: editing?.versaoId || d!.atual,
          data: date,
          placar: score,
          deckAdversario: opponent,
          criadoEm: editing?.criadoEm || new Date().toISOString(),
        },
        editing?.id,
      );
      setEditing(undefined);
      setOpponent("");
      setDeckId("");
      try {
        await refresh();
      } catch {
        throw new Error(
          "A partida foi salva, mas não foi possível atualizar a tela. Use Atualizar dados para consultá-la.",
        );
      }
      setMessage("Partida salva. Estatísticas atualizadas.");
    });
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">CADA JOGO CONTA</p>
          <h2>Partidas</h2>
        </div>
      </div>
      <section className="panel">
        <h3>{editing ? "Corrigir partida" : "Registrar partida"}</h3>
        {requireConfirmation && <p className="muted">Registro opcional após o marcador: escolha data e placar manualmente. Nada será salvo até você confirmar.</p>}
        <form className="match-form" onSubmit={submit}>
          <label>
            Deck
            {editing ? (
              <input
                disabled
                value={
                  decks.find((d) => d.id === editing.deckId)?.nome ||
                  editing.deckId
                }
              />
            ) : (
              <select
                required
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
              >
                <option value="">Selecione um deck</option>
                {active.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>Deck do oponente
            <input value={opponent} maxLength={200} list="opponent-suggestions" onChange={e => setOpponent(e.target.value)} />
            <datalist id="opponent-suggestions">
              {suggestions.filter(o => o.value.startsWith("name:")).map(o => (
                <option key={o.value} value={o.label} />
              ))}
            </datalist>
          </label>
          <label>
            Data
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min="1900-01-01"
              max="2100-12-31"
            />
          </label>
          <label>
            Placar
            <select
              value={score}
              onChange={(e) => setScore(e.target.value as Score)}
            >
              {scores.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button disabled={busy || (!editing && !active.length)}>
            {busy ? "Aguarde…" : editing ? "Salvar correção" : "Registrar"}
          </button>
          {editing && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => { setEditing(undefined); setOpponent(""); }}
            >
              Cancelar
            </button>
          )}
        </form>
        <p className="muted">
          Novas partidas usam a versão atual do deck. Correções preservam a
          lista utilizada.
        </p>
        {!active.length && (
          <p className="muted">
            Cadastre ou restaure um deck para registrar partidas.
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Histórico</h3>
        {!matches.length ? (
          <p className="empty">Nenhuma partida registrada.</p>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Histórico de partidas; role horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Deck</th>
                  <th>Deck adversário</th>
                  <th>Placar</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id}>
                    <td>{m.data.split("-").reverse().join("/")}</td>
                    <td>
                      {decks.find((d) => d.id === m.deckId)?.nome || m.deckId}
                      <br />
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          action(async () =>
                            setVersion(
                              await getVersion(uid, m.deckId, m.versaoId),
                            ),
                          )
                        }
                      >
                        Ver versão usada
                      </button>
                    </td>
                    <td>
                      {m.deckAdversario || "Sem deck adversário informado"}
                    </td>
                    <td>
                      <span className="score">{m.placar}</span>
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditing(m);
                            setDate(m.data);
                            setScore(m.placar);
                            setOpponent(m.deckAdversario || "");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Corrigir
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              if (
                                window.confirm(
                                  "Excluir esta partida? As estatísticas serão recalculadas.",
                                )
                              ) {
                                await deleteMatch(uid, m.id);
                                if (editing?.id === m.id) setEditing(undefined);
                                await refresh();
                              }
                            })
                          }
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => action(loadMore)}
          >
            Carregar mais 50 partidas
          </button>
        )}
      </section>
      {version && (
        <section className="panel">
          <div className="section-heading">
            <h3>
              Lista usada na partida ·{" "}
              {new Date(version.criadoEm).toLocaleString("pt-BR")}
            </h3>
            <button className="secondary" onClick={() => setVersion(undefined)}>
              Fechar
            </button>
          </div>
          <CardList validation={version.validacao} />
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
