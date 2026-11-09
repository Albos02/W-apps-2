export function createStorage(storage) {
  function read(key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key));
      // Valid JSON can still have the wrong shape for a preference.
      if (Array.isArray(fallback)) {
        return Array.isArray(value)
          ? [...new Set(value.filter((item) => typeof item === "string"))]
          : fallback;
      }
      return typeof value === typeof fallback ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // Preferences remain usable when browser storage is unavailable.
    }
  }

  return { read, save };
}
