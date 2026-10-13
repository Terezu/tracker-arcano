import { createHash } from "node:crypto";
import type { Plugin } from "vite";
export function offlinePlugin(): Plugin {
  return { name: "life-offline-shell", apply: "build", generateBundle(_options, bundle) {
    const checked = new Set<string>();
    const assets = new Set<string>();
    const checkOffline = (file: string) => {
      if(checked.has(file)) return;
      checked.add(file);
      const chunk = bundle[file];
      if(!chunk || chunk.type !== "chunk") return;
      assets.add(file);
      for (const css of chunk.viteMetadata?.importedCss ?? []) assets.add(css);
      for (const asset of chunk.viteMetadata?.importedAssets ?? []) assets.add(asset);
      if(Object.keys(chunk.modules).some(path => /node_modules\/(?:@firebase|firebase)\//.test(path.replaceAll("\\","/")) || /src\/(?:services\/|lib\/firebase)/.test(path.replaceAll("\\","/")))) this.error("A entrada offline não pode importar serviços Firebase ou dados privados.");
      for(const dependency of [...chunk.imports, ...chunk.dynamicImports]) checkOffline(dependency);
    };
    for(const chunk of Object.values(bundle)) if(chunk.type === "chunk" && chunk.isEntry && chunk.facadeModuleId?.replaceAll("\\","/").endsWith("/marcador.html")) checkOffline(chunk.fileName);
    // Component-only test builds do not include the isolated HTML entry.
    if (!assets.size) return;
    const files = ["/marcador.html", "/manifest.webmanifest", "/favicon.svg", "/life-icon.svg", ...[...assets].map(name => "/" + name)];
    const version = createHash("sha256").update(JSON.stringify(files)).update(Object.values(bundle).map(item => item.type === "chunk" ? item.code : String(item.source)).join("")).digest("hex").slice(0,16);
    const source = `
const CACHE = "arcano-life-${version}";
const FILES = ${JSON.stringify(files)};
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try { await cache.addAll(FILES); } catch(error) { await caches.delete(CACHE); throw error; }
})()));
// Updates wait until old tabs close; never interrupt an active game.
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith("arcano-life-") && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    if (url.pathname === "/marcador.html") event.respondWith(caches.open(CACHE).then(cache => cache.match("/marcador.html")));
    else event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.open(CACHE).then(cache => cache.match("/marcador.html"))));
    return;
  }
  if (FILES.includes(url.pathname)) event.respondWith(caches.open(CACHE).then(async cache => await cache.match(url.pathname) || fetch(event.request)));
});
`;
    this.emitFile({ type:"asset", fileName:"sw.js", source });
  } };
}
