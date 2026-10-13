import { useState } from "react";
import { randomFace } from "./domain";
export function Tools() {
  const [result, setResult] = useState("");
  return <details className="life-disclosure"><summary>Dado e moeda</summary><div className="actions"><button onClick={() => setResult(`D6: ${randomFace(6)}`)}>Lançar D6</button><button onClick={() => setResult(`Moeda: ${randomFace(2) === 1 ? "Cara" : "Coroa"}`)}>Lançar moeda</button></div><output className="life-random-result" aria-live="polite">{result || "Escolha uma ferramenta."}</output></details>;
}
