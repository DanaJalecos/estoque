// admin-users — gestão de usuários (admin-only)
// Substitui o uso de service_role no frontend
// Validações: SOMENTE quem tem profiles.role='admin' pode invocar

const SUPA_URL = Deno.env.get('SB_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE  = Deno.env.get('SB_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON     = Deno.env.get('SB_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function adminCheck(authHeader: string | null): Promise<{ ok: boolean; uid?: string; reason?: string }> {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, reason: 'no auth' };
  const userJwt = authHeader.replace('Bearer ', '');

  // Pega user via /auth/v1/user usando o JWT do chamador
  const me = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON, 'Authorization': `Bearer ${userJwt}` },
  });
  if (!me.ok) return { ok: false, reason: 'invalid jwt' };
  const u = await me.json();
  const uid = u?.id;
  if (!uid) return { ok: false, reason: 'no uid' };

  // Verifica role no profiles via service
  const pr = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, {
    headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}` },
  });
  const arr = await pr.json();
  const role = Array.isArray(arr) && arr[0]?.role;
  if (role !== 'admin') return { ok: false, reason: `role=${role}` };
  return { ok: true, uid };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Use POST' }, 405);

  const check = await adminCheck(req.headers.get('Authorization'));
  if (!check.ok) return json({ error: 'forbidden', reason: check.reason }, 403);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { action, ...rest } = payload || {};

  // === LISTAR ===
  if (action === 'list') {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=200`, {
      headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}` },
    });
    const d = await r.json();
    return json({ users: d.users || d || [] }, r.ok ? 200 : r.status);
  }

  // === CRIAR ===
  if (action === 'create') {
    const { email, password, name, role } = rest;
    if (!email || !password || !name || !role) return json({ error: 'campos obrigatorios: email,password,name,role' }, 400);
    if (!['admin','gerente','estoquista','costureira','user'].includes(role)) return json({ error: 'role invalido' }, 400);
    if (password.length < 6) return json({ error: 'senha precisa de 6+ chars' }, 400);

    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const created = await r.json();
    if (!r.ok) return json({ error: created?.msg || created?.message || 'erro ao criar', details: created }, r.status);

    // Upsert no profile
    if (created.id) {
      await fetch(`${SUPA_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`,
          'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: created.id, display_name: name, role }),
      });
    }
    return json({ ok: true, user: { id: created.id, email: created.email, name, role } });
  }

  // === DELETAR ===
  if (action === 'delete') {
    const { uid } = rest;
    if (!uid) return json({ error: 'uid obrigatorio' }, 400);
    if (uid === check.uid) return json({ error: 'nao pode apagar a propria conta' }, 400);
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}` },
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: 'erro ao apagar', details: t }, r.status);
    }
    return json({ ok: true });
  }

  // === UPDATE ROLE ===
  if (action === 'update_role') {
    const { uid, role } = rest;
    if (!uid || !role) return json({ error: 'uid + role obrigatorios' }, 400);
    if (!['admin','gerente','estoquista','costureira','user'].includes(role)) return json({ error: 'role invalido' }, 400);
    const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ role }),
    });
    if (!r.ok) return json({ error: 'erro ao atualizar role' }, r.status);
    return json({ ok: true });
  }

  return json({ error: `action desconhecida: ${action}` }, 400);
});
