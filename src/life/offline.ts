export async function prepareOffline() {
  if (!import.meta.env.PROD) throw new Error("A preparação offline está disponível no build de produção (npm run build e npm run preview) ou no site HTTPS publicado.");
  if (!("serviceWorker" in navigator) || !window.isSecureContext) throw new Error("Este navegador não permite cache offline. Use HTTPS ou localhost com Service Worker habilitado.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  if (registration.active || registration.waiting) return;
  const worker = registration.installing;
  if (!worker) throw new Error("Não foi possível iniciar o cache offline. Tente novamente com conexão.");
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("A preparação offline demorou demais. Confira a conexão e tente novamente.")), 30000);
    function finish(error?: Error) {
      window.clearTimeout(timeout);
      worker!.removeEventListener("statechange", check);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (worker!.state === "activated" || worker!.state === "installed") finish();
      else if (worker!.state === "redundant") finish(new Error("Não foi possível guardar os arquivos offline. Confira a conexão e o espaço disponível."));
    }
    worker.addEventListener("statechange", check);
    check();
  });
}
