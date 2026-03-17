const store = globalThis.__coezivTvStore || new Map();

if (!globalThis.__coezivTvStore) {
  globalThis.__coezivTvStore = store;
}

export default store;
