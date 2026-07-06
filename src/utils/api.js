// Front-end API client for the Carease WMS backend (Prisma + Neon).
// Activated only when VITE_API_URL is set at build/dev time. When it is empty
// (e.g. the static Netlify preview), the app runs fully local as before.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const SLUG = import.meta.env.VITE_WMS_SLUG || 'carease-default';

export const backendEnabled = () => Boolean(BASE) || import.meta.env.VITE_BACKEND === 'on'; // '' + VITE_BACKEND=on => same-origin Netlify Functions at /api/*
export const workspaceSlug = () => SLUG;

async function json(res) {
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiHealth() {
  return json(await fetch(BASE + '/api/health'));
}

export async function apiGetState() {
  return json(await fetch(BASE + '/api/state?slug=' + encodeURIComponent(SLUG)));
}

export async function apiPutState(state, version) {
  return json(
    await fetch(BASE + '/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: SLUG, state, version }),
    })
  );
}

// History / restore points — list saved versions, and fetch one version's full state.
export async function apiGetSnapshots(limit = 25) {
  return json(await fetch(BASE + '/api/snapshots?slug=' + encodeURIComponent(SLUG) + '&limit=' + limit));
}
export async function apiGetSnapshot(version) {
  return json(await fetch(BASE + '/api/snapshots?slug=' + encodeURIComponent(SLUG) + '&version=' + version));
}
