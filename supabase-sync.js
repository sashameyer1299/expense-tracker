// Two-device sync via Supabase's REST API (PostgREST) — plain fetch(), no supabase-js library,
// no CDN, per this repo's no-third-party-scripts rule. Local IndexedDB/localStorage stays the
// fast offline cache; every call here is best-effort and silently no-ops when offline or
// unreachable, so the app keeps working exactly as before with no network at all.
//
// Every record uses a client-generated UUID (crypto.randomUUID()) as its id, not IndexedDB's
// autoIncrement — two independently-writing devices can't collide on autoIncrement integers,
// but they can't collide on random UUIDs either.

const SUPABASE_URL = 'https://kjxruqqmprvvmxeinglx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xU0gY5kGOFs4ypJbGaFmtA_JOqYRpgM';

function supabaseHeaders(extra) {
  return Object.assign(
    {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    extra || {}
  );
}

async function supabasePull(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: supabaseHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null; // offline/unreachable — caller keeps using local data
  }
}

// Upsert — works for both new records and edits, since every record carries its full state
// and the server resolves on the primary key (id).
async function supabasePush(table, record) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(record),
    });
  } catch (e) { /* offline — local write already happened; next sync catches this up */ }
}

async function supabaseDelete(table, id) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: supabaseHeaders() });
  } catch (e) { /* offline */ }
}

async function supabasePullSettings() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=*&limit=1`, { headers: supabaseHeaders() });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch (e) {
    return null;
  }
}

async function supabasePushSettings(partial) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.true`, {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify(partial),
    });
  } catch (e) { /* offline */ }
}

// Merge a remote table into a local IndexedDB store: remote wins per-record when its
// updated_at is newer (or the record doesn't exist locally yet); any local-only record not
// present remotely gets pushed up (covers records created while offline). Last-write-wins —
// no field-level merge — which is proportionate for a two-person household, not a large team.
async function syncStore(table, { getAllLocal, putLocal, toRemote }) {
  const remote = await supabasePull(table);
  if (!remote) return; // offline — skip silently, local data stands as-is

  const local = await getAllLocal();
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteIds = new Set();

  for (const r of remote) {
    remoteIds.add(r.id);
    const l = localById.get(r.id);
    if (!l || new Date(r.updated_at) > new Date(l.updatedAt || 0)) {
      await putLocal(r);
    }
  }
  for (const l of local) {
    if (!remoteIds.has(l.id)) {
      await supabasePush(table, toRemote(l));
    }
  }
}

// Re-sync when the tab regains focus (covers "switched away, other phone made changes, came
// back") on top of the sync-on-load every page already does. No websockets/realtime client —
// polling on focus is simple, dependency-free, and enough for a household budget app.
function scheduleFocusSync(fn) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fn();
  });
  window.addEventListener('focus', fn);
}
