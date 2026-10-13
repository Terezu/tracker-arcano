// Representative API objects. Tithing Blade identifiers verified against Scryfall.
const single = {
  id: "mountain-print", oracle_id: "mountain-oracle", name: "Mountain",
  type_line: "Basic Land — Mountain", oracle_text: "{T}: Add {R}.",
  legalities: { pauper: "legal" }, image_uris: { normal: "https://cards.scryfall.io/mountain.jpg" },
};
const multiface = (id: string, layout: string, names: string[], separateImages: boolean, pauper = "legal") => ({
  id, oracle_id: `${id}-oracle`, layout, name: names.join(" // "),
  type_line: "Creature // Sorcery", legalities: { pauper },
  ...(separateImages ? {} : { image_uris: { normal: `https://cards.scryfall.io/${id}.jpg` } }),
  card_faces: names.map((name, index) => ({ name, type_line: index ? "Sorcery" : "Creature", oracle_text: `Rules for ${name}.`,
    ...(separateImages ? { image_uris: { normal: `https://cards.scryfall.io/${id}-${index}.jpg` } } : {}),
  })),
});
export const scryfallFixtures = [
  single,
  { ...multiface("dbaa9a2d-e9fd-4746-a26c-f99ae731f024", "transform", ["Tithing Blade", "Consuming Sepulcher"], true),
    oracle_id: "883a4180-9ede-4249-a4b8-3a29c998fb63", type_line: "Artifact // Artifact" },
  multiface("malakir", "modal_dfc", ["Malakir Rebirth", "Malakir Mire"], true, "not_legal"),
  multiface("fire-ice", "split", ["Fire", "Ice"], false),
  multiface("guidemother", "adventure", ["Faerie Guidemother", "Gift of the Fae"], false),
  multiface("graverobber", "flip", ["Nezumi Graverobber", "Nighteyes the Desecrator"], false, "not_legal"),
];
