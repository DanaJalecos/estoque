// bling-webhook — recebe POST do Bling quando um pedido é vendido/faturado
// e desconta a matéria-prima da ficha técnica automaticamente
//
// URL pra cadastrar no Bling:
//   https://jkvoqqqiwtpsruwoioxl.supabase.co/functions/v1/bling-webhook?secret=<WEBHOOK_SECRET>
//
// Eventos que disparam saída automática: 'pedido_venda_alterado' com situação 9 (Atendido)
// ou 'pedido_venda_criado' com situação ≥ 6 (Em produção / Pronto pra envio / etc)

const SB_URL = Deno.env.get('SB_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SB_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// Status do Bling que disparam saída de matéria-prima
// 6=Em digitação · 9=Atendido · 12=Cancelado · 15=Em aberto · 16=Verificado
const TRIGGER_STATUS = new Set([9]); // só "Atendido" por padrão (já vendido + entregue)

async function sb(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'apikey': SB_SERVICE,
      'Authorization': `Bearer ${SB_SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return await r.json();
}

// Tenta achar o produto da ficha técnica que casa com o SKU vendido
function matchFichaProduto(sku: string, produtos: any[]): any | null {
  if (!sku) return null;
  const skuU = sku.toUpperCase();
  // 1) Match exato pelo `bling_codigo_pattern`
  let m = produtos.find((p: any) => p.bling_codigo_pattern && skuU.includes(p.bling_codigo_pattern.toUpperCase()));
  if (m) return m;
  // 2) Match por código (ex: "375-ADA" no SKU)
  m = produtos.find((p: any) => p.codigo && skuU.includes(p.codigo.toUpperCase()));
  if (m) return m;
  // 3) Prefixo numérico ("080-SCRUB LOREN" → "080-")
  const prefix = (skuU.match(/^\d{3}-/) || [])[0];
  if (prefix) {
    m = produtos.find((p: any) => p.codigo && p.codigo.toUpperCase().startsWith(prefix));
    if (m) return m;
  }
  return null;
}

async function processarPedido(pedido: any) {
  const numero = pedido.numero ?? pedido.id ?? '?';
  const itens: any[] = pedido.itens ?? pedido.itensPedido ?? [];
  if (!itens.length) return { numero, ok: false, reason: 'sem itens' };

  // Carrega ficha técnica completa (1 request)
  const produtos = await sb('ficha_produtos?select=codigo,nome,bling_codigo_pattern&ativo=eq.true');
  const itensFicha = await sb('ficha_tecnica?select=produto_codigo,fabric_id,quantidade,unidade');

  // Mapa: produto_codigo → array de itens da ficha
  const fichaPorProduto: Record<string, any[]> = {};
  for (const f of itensFicha) {
    if (!f.fabric_id) continue;
    (fichaPorProduto[f.produto_codigo] ||= []).push(f);
  }

  // Pra cada item do pedido, acha produto + multiplica
  const movements: any[] = [];
  const stockUpdates: Record<string, number> = {}; // fabric_id → qty pra subtrair
  const matched: any[] = [];
  const unmatched: any[] = [];

  for (const it of itens) {
    const sku = it.codigo || it.sku || it.produto?.codigo || '';
    const qty = Number(it.quantidade ?? it.qtd ?? 1);
    const produto = matchFichaProduto(sku, produtos);
    if (!produto) {
      unmatched.push({ sku, qty });
      continue;
    }
    const ficha = fichaPorProduto[produto.codigo] || [];
    matched.push({ sku, produto: produto.codigo, qty, ficha_itens: ficha.length });
    for (const f of ficha) {
      const total = Number(f.quantidade) * qty;
      stockUpdates[f.fabric_id] = (stockUpdates[f.fabric_id] || 0) + total;
      movements.push({
        fabric_id: f.fabric_id,
        type: 'saida',
        qty: total,
        date: new Date().toISOString().slice(0, 10),
        detail: `Bling: ${qty}× ${produto.codigo} (NF #${numero})`,
        who: 'Webhook Bling',
      });
    }
  }

  // Insere movements em batch
  if (movements.length) {
    await sb('movements', { method: 'POST', body: JSON.stringify(movements) });
  }
  // Atualiza stock — fetch + subtrai + update (transação seria melhor via RPC, mas funciona)
  for (const [fid, qty] of Object.entries(stockUpdates)) {
    const fab = await sb(`fabrics?select=stock&id=eq.${fid}`);
    const novoStock = Number(fab[0]?.stock || 0) - qty;
    await sb(`fabrics?id=eq.${fid}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ stock: novoStock }),
    });
  }

  return {
    numero, ok: true,
    matched: matched.length,
    unmatched: unmatched.length,
    movements_criados: movements.length,
    fabrics_descontados: Object.keys(stockUpdates).length,
    items: { matched, unmatched },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'use POST' }, 405);

  // Auth: aceita ?secret= na URL OU header x-webhook-secret (Bling permite ambos)
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  const headerSecret = req.headers.get('x-webhook-secret');
  const ok = WEBHOOK_SECRET && (querySecret === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET);
  if (!ok) return json({ error: 'forbidden' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  // Bling envia: { evento: 'pedido_venda_alterado', dados: { situacao: { id: 9 }, ... pedidoCompleto } }
  // Mas formato varia — aceita estruturas diferentes
  const evento = body.evento || body.type || '';
  const pedido = body.dados?.pedido || body.pedido || body.data?.pedido || body.dados || body.data || body;
  const situacaoId = pedido?.situacao?.id || pedido?.situacao_id || 0;

  // Log de auditoria
  await sb('webhook_log', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      source: 'bling',
      event: evento || 'desconhecido',
      payload: body,
      processed_at: new Date().toISOString(),
    }),
  }).catch(()=>{});  // tabela pode não existir

  // Só processa se a situação dispara saída
  if (!TRIGGER_STATUS.has(Number(situacaoId))) {
    return json({
      ok: true,
      ignored: true,
      reason: `situacao=${situacaoId} (não dispara saída)`,
      evento,
    });
  }

  try {
    const result = await processarPedido(pedido);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
