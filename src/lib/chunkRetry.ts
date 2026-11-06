type ReloadStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const reloadKey = "tracker-arcano:chunk-reload";

function sessionStore(): ReloadStorage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

// A tab opened after a deploy may ask for a file that no longer exists. Reload once to get
// the new version; if the reload already happened (or storage is blocked) the error surfaces,
// so the page can never enter a reload loop.
export function retryChunk<T>(
  load: () => Promise<T>,
  storage: ReloadStorage | undefined = sessionStore(),
  reload: () => void = () => window.location.reload(),
): Promise<T> {
  return load().then(
    (module) => {
      try { storage?.removeItem(reloadKey); } catch { /* storage blocked: nothing to clear */ }
      return module;
    },
    (error) => {
      try {
        if (storage && !storage.getItem(reloadKey)) {
          storage.setItem(reloadKey, "1");
          reload();
          return new Promise<T>(() => {});
        }
        storage?.removeItem(reloadKey);
      } catch { /* storage blocked: report the error instead of reloading */ }
      throw error;
    },
  );
}
