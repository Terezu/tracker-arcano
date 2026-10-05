export const scores = [
  "2-0",
  "2-1",
  "1-1",
  "1-2",
  "0-2",
  "1-0",
  "0-1",
  "0-0",
] as const;
export type Score = (typeof scores)[number];
export interface Card {
  id: string;
  name: string;
  oracle_id: string;
  type_line: string;
  oracle_text: string;
  legalities: {
    pauper: string;
  };
  images: string[];
}
export interface Entry {
  name: string;
  quantity: number;
  board: "main" | "side";
  card?: Card;
}
export interface Validation {
  entries: Entry[];
  errors: string[];
  checkedAt: string;
}
export interface Deck {
  id: string;
  nome: string;
  atual: string;
  arquivado: boolean;
}
export interface Version {
  id: string;
  deckId: string;
  texto: string;
  validacao: Validation;
  criadoEm: string;
}
export interface Match {
  id: string;
  deckId: string;
  versaoId: string;
  data: string;
  placar: Score;
  criadoEm: string;
}
