// Bridges the Pinia store to the live backend (Prisma + Neon).
// - On boot: load the saved workspace state and patch it into the store.
// - On change: debounced save back to the backend.
// No-op when VITE_API_URL is not configured, so local/offline use is unchanged.
import { backendEnabled, apiGetState, apiPutState } from '@/utils/api';

export function useBackendSync(store) {
  if (!backendEnabled()) return { enabled: false };

  let version = 0;
  let ready = false; // don't save until the initial load settles (avoids clobbering remote with the empty seed)
  let timer = null;

  apiGetState()
    .then(({ state, version: v }) => {
      if (state && typeof state === 'object' && Object.keys(state).length) {
        store.$patch(state); // backend is the source of truth
        store.applyDirectorySeed(); // ensure mock directory exists even in a pre-existing saved workspace
        store.applyScenarioSeed(); // ensure testability scenario data exists (combine, backorders, partial receipts)
        store.applyScenarioSeedP2(); // P2 testability data (bins, tickets, employee role, employee-held & terminated assets)
        store.applyReplenishSeed(); // top up drained cart-component stock so builds/backorder work
        store.applyScenarioFixSeed(); // repoint seeded SO lines to the live VS8 cart recipe id
      }
      version = v || 0;
      ready = true;
    })
    .catch((e) => {
      // Backend unreachable → fall back to the local sessionStorage cache.
      console.warn('[backend] load failed, using local data:', e.message);
      ready = true;
    });

  store.$subscribe((_mutation, state) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!ready) return;
      try {
        const r = await apiPutState(state, version);
        version = r.version;
      } catch (e) {
        console.warn('[backend] save failed (kept locally):', e.message);
      }
    }, 800);
  });

  return { enabled: true };
}
