import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Deck, Validation, Version } from "../types";
import {
  archiveDeck,
  getVersion,
  renameDeck,
  saveVersion,
} from "../services/data";
import { errorMessage } from "../services/auth";
import { validateList } from "../services/scryfall";
export function Decks({
  uid,
  decks,
  refresh,
}: {
  uid: string;
  decks: Deck[];
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Deck>(),
    [name, setName] = useState(""),
    [text, setText] = useState(""),
    [validation, setValidation] = useState<Validation>(),
    [shown, setShown] = useState<Version>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState(false);
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
  async function edit(deck: Deck) {
    await action(async () => {
      const v = await getVersion(uid, deck.id, deck.atual);
      setEditing(deck);
      setName(deck.nome);
      setText(v.texto);
      setValidation(undefined);
      setShown(v);
      setOpen(true);
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await action(async () => {
      const result = await validateList(text, true);
      setValidation(result);
      if (result.errors.length) return;
      await saveVersion(uid, name, text, result, editing);
      setOpen(false);
      setShown(undefined);
      try {
        await refresh();
      } catch {
        throw new Error(
          "A versão foi salva, mas não foi possível atualizar a tela. Use Atualizar dados para consultá-la.",
        );
      }
      setMessage("Nova versão salva. O histórico anterior foi preservado.");
    });
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">SUAS LISTAS</p>
          <h2>
            Meus decks <span className="muted">{decks.length}</span>
          </h2>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            setEditing(undefined);
            setName("");
            setText("");
            setValidation(undefined);
            setShown(undefined);
            setOpen(true);
          }}
        >
          + Novo deck
        </button>
      </div>
      {!decks.length && (
        <section className="panel empty">
          <h3>Seu primeiro deck está esperando</h3>
          <p>Importe sua lista para começar a registrar partidas.</p>
        </section>
      )}
      <div className="deck-grid">
        {decks.map((d) => (
          <article className="panel deck" key={d.id}>
            <span className="badge">{d.arquivado ? "Arquivado" : "Ativo"}</span>
            <h3>{d.nome}</h3>
            <p className="muted">Histórico preservado por versão</p>
            <div className="actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => edit(d)}
              >
                Lista / nova versão
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const n = window.prompt("Novo nome do deck", d.nome);
                    if (n?.trim() && n.trim().length <= 80) {
                      await renameDeck(uid, d.id, n);
                      await refresh();
                    }
                  })
                }
              >
                Renomear
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await archiveDeck(uid, d);
                    await refresh();
                  })
                }
              >
                {d.arquivado ? "Restaurar" : "Arquivar"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const v = await getVersion(uid, d.id, d.atual);
                    const result = await validateList(v.texto, true);
                    setValidation(result);
                    setShown(v);
                    setMessage(
                      result.errors.length
                        ? "A lista atual apresenta problemas. O histórico não foi alterado."
                        : "A lista atual continua legal no Pauper.",
                    );
                  })
                }
              >
                Consultar legalidade atual
              </button>
            </div>
          </article>
        ))}
      </div>
      {open && (
        <section className="panel editor">
          <h2>{editing ? "Criar nova versão" : "Cadastrar deck"}</h2>
          <form onSubmit={save}>
            <label>
              Nome do deck
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label>
              Lista principal e sideboard
              <textarea
                rows={12}
                value={text}
                maxLength={30000}
                onChange={(e) => {
                  setText(e.target.value);
                  setValidation(undefined);
                }}
                required
                placeholder={
                  "Mainboard\n4 Lightning Bolt\n…\nSideboard\n2 Pyroblast\nSB: 1 Red Elemental Blast"
                }
              />
            </label>
            <p className="muted">
              Use nomes ingleses completos. Salvar consulta o Scryfall e cria
              uma versão imutável.
            </p>
            <div className="actions">
              <button disabled={busy}>
                {busy ? "Consultando e salvando…" : "Validar e salvar versão"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => setValidation(await validateList(text)))
                }
              >
                Pré-visualizar validação
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setValidation(undefined);
                  setShown(undefined);
                }}
              >
                Fechar
              </button>
            </div>
          </form>
        </section>
      )}
      {validation && (
        <section className="panel">
          <h3>
            Validação · {new Date(validation.checkedAt).toLocaleString("pt-BR")}
          </h3>
          {validation.errors.length ? (
            <ul role="alert">
              {validation.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <p>Lista válida segundo a consulta no navegador.</p>
          )}
          <CardList validation={validation} />
        </section>
      )}
      {shown && !validation && (
        <section className="panel">
          <h3>
            Versão atual · {new Date(shown.criadoEm).toLocaleString("pt-BR")}
          </h3>
          <p className="muted">
            Validação original:{" "}
            {new Date(shown.validacao.checkedAt).toLocaleString("pt-BR")}
          </p>
          <CardList validation={shown.validacao} />
        </section>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </>
  );
}
export function CardList({ validation }: { validation: Validation }) {
  return (
    <>
      {(["main", "side"] as const).map((board) => (
        <div key={board}>
          <h4>
            {board === "main" ? "Principal" : "Sideboard"} ·{" "}
            {validation.entries
              .filter((e) => e.board === board)
              .reduce((n, e) => n + e.quantity, 0)}{" "}
            cartas
          </h4>
          <div className="cards">
            {validation.entries
              .filter((e) => e.board === board)
              .map((e, i) => (
                <figure key={i}>
                  {e.card?.images.map((url, j) => (
                    <img
                      key={url}
                      src={url}
                      alt={`${e.card?.name} — face ${j + 1}`}
                      loading="lazy"
                    />
                  ))}
                  <figcaption>
                    {e.quantity}× {e.card?.name || e.name}
                  </figcaption>
                </figure>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
