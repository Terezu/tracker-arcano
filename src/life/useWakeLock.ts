import { useEffect } from "react";

/** Mantém a tela ligada enquanto o componente estiver montado, quando o navegador oferece suporte. */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let requesting = false, mounted = true;
    const acquire = async () => {
      if (requesting || (lock && !lock.released) || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (mounted) lock = acquired;
        else await acquired.release();
      } catch {
        // Recusas (bateria fraca, falta de gesto do usuário) não impedem o uso do marcador.
      } finally {
        requesting = false;
      }
    };
    // O sistema libera a trava ao ocultar a página; alguns navegadores só a concedem após um toque.
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    document.addEventListener("click", acquire, true);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", acquire);
      document.removeEventListener("click", acquire, true);
      lock?.release().catch(() => {});
    };
  }, []);
}
