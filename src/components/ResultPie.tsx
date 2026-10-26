import { useId, useState } from "react";
import type { Match } from "../types";
import { resultSlices } from "../lib/domain";

// The tooltip occupies normal layout space, so it cannot overflow the viewport.
export function ResultPie({ matches }: { matches: Match[] }) {
  const slices = resultSlices(matches);
  const [selected, setSelected] = useState<string>();
  const tooltipId = useId();
  const active = slices.find(s => s.key === selected && s.count > 0);
  const visible = slices.filter(s => s.count > 0);
  if (!matches.length) return <p className="empty">Nenhuma partida nos filtros selecionados.</p>;
  return <div className="result-pie" onKeyDown={e => { if (e.key === "Escape") setSelected(undefined); }}>
    <svg viewBox="0 0 200 200" aria-label="Distribuição de resultados" role="group">
      {visible.map((s, index) => {
        const previous = visible.slice(0, index).reduce((sum, s) => sum + s.percent, 0);
        const start = -Math.PI / 2 + previous / 100 * Math.PI * 2;
        const angle = start + s.percent / 100 * Math.PI * 2;
        const path = s.percent === 100
          ? "M100 10 A90 90 0 1 1 100 190 A90 90 0 1 1 100 10 Z"
          : `M100 100 L${100 + 90 * Math.cos(start)} ${100 + 90 * Math.sin(start)} A90 90 0 ${s.percent > 50 ? 1 : 0} 1 ${100 + 90 * Math.cos(angle)} ${100 + 90 * Math.sin(angle)} Z`;
        const description = `${s.label}: ${s.percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ${s.count} partidas`;
        return <path key={s.key} d={path} className={s.key} role="button" tabIndex={0}
          aria-label={description} aria-pressed={selected === s.key} aria-describedby={active?.key === s.key ? tooltipId : undefined}
          onPointerEnter={e => { if (e.pointerType === "mouse") setSelected(s.key); }}
          onPointerLeave={e => { if (e.pointerType === "mouse") setSelected(undefined); }}
          onFocus={() => setSelected(s.key)} onBlur={() => setSelected(undefined)}
          onClick={() => setSelected(s.key)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(s.key); } }} />;
      })}
    </svg>
    <ul className="legend">{slices.map(s => <li key={s.key}><span className={`pie-swatch ${s.key}`} />{s.label}: {s.count} ({s.percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)</li>)}</ul>
    <div className="pie-tooltip-slot" aria-live="polite">
      {active && <><p role="tooltip" id={tooltipId}>{active.label}: {active.percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · {active.count} partidas</p><button type="button" className="text-button" onClick={() => setSelected(undefined)}>Fechar detalhes</button></>}
    </div>
  </div>;
}
