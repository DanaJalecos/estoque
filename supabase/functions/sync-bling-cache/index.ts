// sync-bling-cache — copia dados do DMS (wltmiq) pras tabelas bling_* do Estoque
// Roda via cron 6h (pg_cron) e sob demanda pelo botão "Atualizar do Bling"
// Reaproveita o sync do Bling que já existe no DMS — não chama Bling diretamente

const SB_URL      = Deno.env.get('SB_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE  = Deno.env.get('SB_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DMS_URL     = Deno.env.get('DMS_URL') ?? '';
const DMS_SERVICE = Deno.env.get('DMS_SERVICE_KEY') ?? '';
const ANON        = Deno.env.get('SB_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function dmsSelect(path: string): Promise<any[]> {
  // PostgREST cap default = 1000 rows. Pagina via Range header até esgotar.
  const all: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const r = await fetch(`${DMS_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': DMS_SERVICE,
        'Authorization': `Bearer ${DMS_SERVICE}`,
        'Range-Unit': 'items',
        'Range': `${from}-${to}`,
      },
    });
    if (!r.ok && r.status !== 206) throw new Error(`DMS ${path}: ${r.status} ${await r.text()}`);
    const chunk = await r.json();
    if (!Array.isArray(chunk)) return chunk;
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    if (all.length > 50000) break; // safety
  }
  return all;
}

async function localTruncateAndInsert(table: string, rows: any[]): Promise<number> {
  // Apaga tudo da tabela antes de inserir (sync = snapshot completo)
  await fetch(`${SB_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: { 'apikey': SB_SERVICE, 'Authorization': `Bearer ${SB_SERVICE}`, 'Prefer': 'return=minimal' },
  }).catch(()=>{});
  // Alguns tem PK não-uuid: tenta segundo critério
  await fetch(`${SB_URL}/rest/v1/${table}?produto=neq.__nope__`, {
    method: 'DELETE',
    headers: { 'apikey': SB_SERVICE, 'Authorization': `Bearer ${SB_SERVICE}`, 'Prefer': 'return=minimal' },
  }).catch(()=>{});

  if (!rows.length) return 0;
  // Insere em chunks de 500
  let total = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SB_SERVICE, 'Authorization': `Bearer ${SB_SERVICE}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${(await r.text()).slice(0,200)}`);
    total += chunk.length;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Auth: aceita CRON_SECRET (pra cron) OU JWT de admin (pra botão na UI)
  const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') || '';
  const cronHdr = req.headers.get('x-cron-secret') || '';
  const isCron = !!CRON_SECRET && (cronHdr === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`);

  let isAdmin = false;
  if (!isCron && auth.startsWith('Bearer ')) {
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { 'apikey': ANON, 'Authorization': auth }});
    if (u.ok) {
      const { id } = await u.json();
      const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}&select=role`, {
        headers: { 'apikey': SB_SERVICE, 'Authorization': `Bearer ${SB_SERVICE}` },
      });
      const arr = await pr.json();
      isAdmin = arr?.[0]?.role === 'admin';
    }
  }
  if (!isCron && !isAdmin) return json({ error: 'forbidden' }, 403);

  const t0 = Date.now();
  const result: Record<string, any> = {};

  try {
    // 1) bling_produtos — catalogo (vem de DMS.produtos WHERE empresa=matriz)
    const prods = await dmsSelect("produtos?select=id,nome,codigo,preco,preco_custo,estoque_virtual,tipo,situacao,formato,imagem_url,created_at,empresa&empresa=eq.matriz&limit=5000");
    const prodsMapped = prods.map((p: any) => ({
      id: p.id, nome: p.nome, codigo: p.codigo, preco: p.preco, preco_custo: p.preco_custo,
      estoque_virtual: p.estoque_virtual, tipo: p.tipo, situacao: p.situacao, formato: p.formato,
      imagem_url: p.imagem_url, bling_created_at: p.created_at, empresa: p.empresa,
      updated_at: new Date().toISOString(),
    }));
    result.bling_produtos = await localTruncateAndInsert('bling_produtos', prodsMapped);

    // 2) bling_top_produtos
    const tops = await dmsSelect("top_produtos?select=produto,total_pedidos,total_quantidade,total_receita,preco_medio&empresa=eq.matriz&order=total_quantidade.desc&limit=200");
    result.bling_top_produtos = await localTruncateAndInsert('bling_top_produtos',
      tops.map((t: any) => ({ ...t, updated_at: new Date().toISOString() }))
    );

    // 3) bling_produto_mes
    const tpm = await dmsSelect("top_produtos_mes?select=produto,ano,mes,total_pedidos,total_quantidade,total_receita,preco_medio&empresa=eq.matriz&limit=10000");
    result.bling_produto_mes = await localTruncateAndInsert('bling_produto_mes', tpm);

    // 4) bling_vendas_mes (13 meses) — coluna `mes` é DATE no Estoque, manda YYYY-MM-01
    const rh = await dmsSelect("receita_historica?select=ano,mes,receita,pedidos,ticket_medio&empresa=eq.matriz&order=ano.desc,mes.desc&limit=13");
    result.bling_vendas_mes = await localTruncateAndInsert('bling_vendas_mes',
      rh.map((r: any) => ({
        mes: `${r.ano}-${String(r.mes).padStart(2,'0')}-01`,
        qtd_pedidos: r.pedidos,
        faturamento_produtos: r.receita,
        ticket_medio: r.ticket_medio,
      }))
    );

    // 5) bling_velocidade_90d (top 100)
    const vel = await dmsSelect("velocidade_90d_view?select=produto,qtd_90d,media_diaria_90d,projecao_mensal,updated_at&empresa=eq.matriz&order=qtd_90d.desc&limit=100");
    result.bling_velocidade_90d = await localTruncateAndInsert('bling_velocidade_90d', vel);

    // 6) bling_trend_periodo
    const trd = await dmsSelect("trend_periodo_view?select=periodo,pedidos,faturamento,pedidos_por_dia,updated_at&empresa=eq.matriz");
    result.bling_trend_periodo = await localTruncateAndInsert('bling_trend_periodo', trd);

    // 7) bling_vendas_dia_semana
    const dws = await dmsSelect("vendas_dia_semana_view?select=dia_semana,nome_dia,qtd_pedidos,faturamento,updated_at&empresa=eq.matriz&order=dia_semana.asc");
    result.bling_vendas_dia_semana = await localTruncateAndInsert('bling_vendas_dia_semana', dws);

    // 8) Atualiza meta
    await fetch(`${SB_URL}/rest/v1/bling_sync_meta?id=eq.1`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_SERVICE, 'Authorization': `Bearer ${SB_SERVICE}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ last_sync_at: new Date().toISOString(), source: 'dms-sync' }),
    });

    return json({ ok: true, ms: Date.now() - t0, ...result });
  } catch (e) {
    return json({ ok: false, error: String(e), ms: Date.now() - t0, partial: result }, 500);
  }
});
