// estoque-ai-chat — Bot IA pro sistema de estoque (Groq Llama 3.3 70B)
// Usa function-calling pra consultar o banco de dados real

const SB_URL = Deno.env.get('SB_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SB_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SB_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

// Providers: Groq (primary) e Gemini (fallback). Ambos com endpoint OpenAI-compatible.
const PROVIDERS = [
  {
    name: 'groq',
    enabled: !!GROQ_KEY,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: GROQ_KEY,
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'gemini',
    enabled: !!GEMINI_KEY,
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    key: GEMINI_KEY,
    model: 'gemini-2.0-flash',
  },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// === HELPERS DE CONSULTA AO SUPABASE ===
async function sb(path: string): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SB_SERVICE, 'Authorization': `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) return { error: `${r.status}: ${await r.text()}` };
  return await r.json();
}

function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

// === TOOLS (functions que o LLM pode chamar) ===
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultar_estoque',
      description: 'Busca matérias-primas (fabrics) por nome/cor/categoria. Use quando o usuário pergunta "quanto tem de X?", "tem oxford?", "estoque de tecido azul", etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Palavra-chave do nome (ex: "oxford", "gabardine branco", "zíper")' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_alertas',
      description: 'Lista produtos em alerta de estoque (sem estoque ou abaixo do mínimo). Use para perguntas tipo "o que precisa comprar?", "o que tá acabando?", "alertas".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_fornecedor',
      description: 'Busca informações de fornecedor por nome/cidade/categoria. Retorna telefone, email, produtos comprados.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nome ou parte do nome do fornecedor (ex: "EXCIM", "soul")' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fornecedor_de_produto',
      description: 'Dado um produto/matéria-prima, retorna o(s) fornecedor(es) que vende(m) ele. Use quando user pergunta "qual fornecedor vende zíper?", "quem fornece gabardine?".',
      parameters: {
        type: 'object',
        properties: {
          produto_query: { type: 'string', description: 'Nome do produto (ex: "zíper", "ribana")' },
        },
        required: ['produto_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_compras_recentes',
      description: 'Histórico de compras recentes. Pode filtrar por nome do produto, fornecedor, ou ver últimas N compras.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Opcional: filtra por produto ou fornecedor' },
          limit: { type: 'number', description: 'Quantas compras retornar (padrão 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_ficha_tecnica',
      description: 'Retorna ficha técnica (BOM) de um produto da Dana. Use quando perguntam "do que é feito o jaleco X?", "qual matéria-prima usa o scrub Y?", "qual o custo do jaleco 375".',
      parameters: {
        type: 'object',
        properties: {
          produto_query: { type: 'string', description: 'Nome ou código do produto (ex: "375-ADA", "DIANA", "SCRUB LOREN")' },
        },
        required: ['produto_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estatisticas_gerais',
      description: 'Retorna números globais do estoque: total fabrics, total compras, valor total em estoque, gastos por mês, etc. Use para visão geral.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'projecao_consumo',
      description: 'Lista produtos que vão acabar nos próximos N dias baseado no consumo histórico de saídas.',
      parameters: {
        type: 'object',
        properties: {
          dias: { type: 'number', description: 'Janela de dias (padrão 14)' },
        },
      },
    },
  },
];

// === IMPLEMENTAÇÕES DAS TOOLS ===
async function runTool(name: string, args: any): Promise<any> {
  try {
    if (name === 'consultar_estoque') {
      const q = (args.query || '').toLowerCase();
      // Busca via ILIKE no nome ou cor
      const enc = encodeURIComponent(`%${q}%`);
      const fabs = await sb(`fabrics?select=id,name,color,unit,stock,min_stock&or=(name.ilike.${enc},color.ilike.${enc})&order=stock.desc&limit=15`);
      if (!Array.isArray(fabs) || !fabs.length) return { resultado: 'nada encontrado', query: q };
      return {
        encontrados: fabs.length,
        produtos: fabs.map((f: any) => ({
          nome: f.name + (f.color ? ' / ' + f.color : ''),
          estoque: `${f.stock} ${f.unit}`,
          minimo: `${f.min_stock} ${f.unit}`,
          status: f.stock <= 0 ? 'SEM ESTOQUE' : f.stock <= f.min_stock ? 'BAIXO' : 'OK',
        })),
      };
    }

    if (name === 'consultar_alertas') {
      const all = await sb(`fabrics?select=name,color,unit,stock,min_stock,fornecedor_id&order=stock.asc&limit=200`);
      if (!Array.isArray(all)) return { erro: 'falha ao consultar' };
      const sem = all.filter((f: any) => (f.stock || 0) <= 0);
      const baixo = all.filter((f: any) => f.stock > 0 && (f.min_stock || 0) > 0 && f.stock <= f.min_stock);
      return {
        sem_estoque: sem.length,
        estoque_baixo: baixo.length,
        criticos: sem.slice(0, 10).map((f: any) => f.name + (f.color ? ' / ' + f.color : '')),
        baixo: baixo.slice(0, 10).map((f: any) => `${f.name}${f.color ? ' / ' + f.color : ''} (${f.stock}/${f.min_stock} ${f.unit})`),
      };
    }

    if (name === 'consultar_fornecedor') {
      const q = (args.query || '').toLowerCase();
      const enc = encodeURIComponent(`%${q}%`);
      const forns = await sb(`fornecedores?select=id,nome,cnpj,cidade,uf,telefone,whatsapp,email,categorias,ultima_compra,total_compras_valor&or=(nome.ilike.${enc},razao_social.ilike.${enc})&limit=10`);
      if (!Array.isArray(forns) || !forns.length) return { resultado: 'nenhum fornecedor encontrado', query: q };
      return {
        encontrados: forns.length,
        fornecedores: forns,
      };
    }

    if (name === 'fornecedor_de_produto') {
      const q = (args.produto_query || '').toLowerCase();
      const enc = encodeURIComponent(`%${q}%`);
      // Acha fabrics que casam
      const fabs = await sb(`fabrics?select=id,name,fornecedor_id,unit,stock&name.ilike.${enc}&limit=15`);
      if (!Array.isArray(fabs) || !fabs.length) return { resultado: 'nenhum produto encontrado' };
      // Pega fornecedores únicos
      const fornIds = [...new Set(fabs.filter((f: any) => f.fornecedor_id).map((f: any) => f.fornecedor_id))];
      const forns = fornIds.length ? await sb(`fornecedores?select=id,nome,telefone,whatsapp,email&id=in.(${fornIds.join(',')})`) : [];
      return {
        produtos_encontrados: fabs.length,
        produtos_amostra: fabs.slice(0, 5).map((f: any) => `${f.name} (${f.stock} ${f.unit})`),
        fornecedores: forns,
      };
    }

    if (name === 'consultar_compras_recentes') {
      const q = (args.query || '').toLowerCase();
      const limit = args.limit || 10;
      let purchases;
      if (q) {
        // join via in()
        const enc = encodeURIComponent(`%${q}%`);
        const fabs = await sb(`fabrics?select=id,name&name.ilike.${enc}&limit=20`);
        const fIds = Array.isArray(fabs) ? fabs.map((f: any) => f.id) : [];
        if (!fIds.length) return { resultado: 'sem compras pra esse produto' };
        purchases = await sb(`purchases?select=qty,unit_price,total_price,date,nf_number,fabric_id,fornecedor_id&fabric_id=in.(${fIds.join(',')})&order=date.desc&limit=${limit}`);
      } else {
        purchases = await sb(`purchases?select=qty,unit_price,total_price,date,nf_number,fabric_id,fornecedor_id&order=date.desc&limit=${limit}`);
      }
      if (!Array.isArray(purchases)) return { erro: 'falha' };
      // Enrich
      const fabIds = [...new Set(purchases.map((p: any) => p.fabric_id))];
      const fornIds = [...new Set(purchases.map((p: any) => p.fornecedor_id).filter(Boolean))];
      const [fabs, forns] = await Promise.all([
        fabIds.length ? sb(`fabrics?select=id,name,unit&id=in.(${fabIds.join(',')})`) : [],
        fornIds.length ? sb(`fornecedores?select=id,nome&id=in.(${fornIds.join(',')})`) : [],
      ]);
      const fmap: any = {}, fmFor: any = {};
      (fabs || []).forEach((f: any) => fmap[f.id] = f);
      (forns || []).forEach((f: any) => fmFor[f.id] = f);
      return {
        compras: purchases.map((p: any) => ({
          data: p.date,
          produto: fmap[p.fabric_id]?.name || '?',
          qty: `${p.qty} ${fmap[p.fabric_id]?.unit || ''}`,
          unit_price: `R$ ${Number(p.unit_price || 0).toFixed(2)}`,
          total: `R$ ${Number(p.total_price || 0).toFixed(2)}`,
          fornecedor: fmFor[p.fornecedor_id]?.nome || '?',
          nf: p.nf_number,
        })),
      };
    }

    if (name === 'consultar_ficha_tecnica') {
      const q = (args.produto_query || '').toLowerCase();
      const enc = encodeURIComponent(`%${q}%`);
      const produtos = await sb(`ficha_produtos?select=codigo,nome,tipo,custo_total,total_itens&or=(codigo.ilike.${enc},nome.ilike.${enc})&limit=5`);
      if (!Array.isArray(produtos) || !produtos.length) return { resultado: 'produto não encontrado' };
      const codigos = produtos.map((p: any) => `'${p.codigo}'`).join(',');
      const itens = await sb(`ficha_tecnica?select=produto_codigo,item_descricao,quantidade,unidade,custo_unitario,custo_total&produto_codigo=in.(${codigos})&order=produto_codigo,ordem`);
      const r: any = {};
      produtos.forEach((p: any) => r[p.codigo] = {
        nome: p.nome,
        tipo: p.tipo,
        custo_producao: `R$ ${Number(p.custo_total || 0).toFixed(2)}`,
        total_itens: p.total_itens,
        materias_primas: [],
      });
      (Array.isArray(itens) ? itens : []).forEach((it: any) => {
        if (r[it.produto_codigo]) {
          r[it.produto_codigo].materias_primas.push({
            item: it.item_descricao,
            qtd: `${it.quantidade} ${it.unidade}`,
            custo_unit: `R$ ${Number(it.custo_unitario || 0).toFixed(2)}`,
            subtotal: `R$ ${Number(it.custo_total || 0).toFixed(2)}`,
          });
        }
      });
      return r;
    }

    if (name === 'estatisticas_gerais') {
      const [fabs, purs, forns, fcm, mvm] = await Promise.all([
        sb('fabrics?select=stock,min_stock'),
        sb('purchases?select=total_price,date'),
        sb('fornecedores?select=id'),
        sb('fabric_custo_medio?select=valor_em_estoque'),
        sb('movements?select=type,date'),
      ]);
      const valorTotal = Array.isArray(fcm) ? fcm.reduce((s: number, r: any) => s + Number(r.valor_em_estoque || 0), 0) : 0;
      const totalGasto = Array.isArray(purs) ? purs.reduce((s: number, p: any) => s + Number(p.total_price || 0), 0) : 0;
      const semEstoque = Array.isArray(fabs) ? fabs.filter((f: any) => (f.stock || 0) <= 0).length : 0;
      const baixo = Array.isArray(fabs) ? fabs.filter((f: any) => f.stock > 0 && (f.min_stock || 0) > 0 && f.stock <= f.min_stock).length : 0;
      // Compras por mês (últimos 6)
      const byMonth: Record<string, number> = {};
      (Array.isArray(purs) ? purs : []).forEach((p: any) => {
        const k = (p.date || '').slice(0, 7);
        byMonth[k] = (byMonth[k] || 0) + Number(p.total_price || 0);
      });
      return {
        total_fabrics: Array.isArray(fabs) ? fabs.length : 0,
        sem_estoque: semEstoque,
        estoque_baixo: baixo,
        total_fornecedores: Array.isArray(forns) ? forns.length : 0,
        total_compras: Array.isArray(purs) ? purs.length : 0,
        total_gasto_historico: `R$ ${totalGasto.toFixed(2)}`,
        valor_estoque_atual: `R$ ${valorTotal.toFixed(2)}`,
        gasto_por_mes: byMonth,
      };
    }

    if (name === 'projecao_consumo') {
      const dias = args.dias || 14;
      const v = await sb(`consumo_projetado?select=fabric_name,estoque_atual,consumo_30d_projetado,dias_de_cobertura&dias_de_cobertura=lte.${dias}&order=dias_de_cobertura.asc&limit=20`);
      if (!Array.isArray(v) || !v.length) return { resultado: `nenhum produto vai acabar nos próximos ${dias} dias` };
      return {
        produtos_em_risco: v.length,
        janela_dias: dias,
        produtos: v,
      };
    }

    return { erro: `tool desconhecida: ${name}` };
  } catch (e) {
    return { erro: String(e) };
  }
}

// === SYSTEM PROMPT ===
const SYSTEM_PROMPT = `Você é o assistente de IA do Sistema de Estoque da Dana Jalecos, uma indústria de jalecos profissionais.

Você tem acesso a tools que consultam o banco de dados real. SEMPRE use as tools antes de responder números — nunca chute valores.

Tópicos que você cobre:
- Consulta de estoque (matéria-prima): tecidos, aviamentos, etiquetas, etc
- Fornecedores: contato, histórico
- Compras: histórico, último preço pago
- Ficha técnica: BOM dos jalecos (do que cada modelo é feito)
- Alertas: o que precisa comprar
- Projeção: o que vai acabar nos próximos dias

Estilo:
- Responda em português, direto e claro
- Use formatação leve (negrito, listas) quando ajudar
- Se não souber, diga "não tenho essa info" — não invente
- Use emojis com moderação (🧵 tecido · 🧷 aviamento · ⚠️ alerta · 💰 dinheiro)
- Seja conciso. Respostas curtas são melhores que longas.

NUNCA exponha:
- IDs internos do banco (UUIDs)
- Estrutura técnica do sistema
- Senhas/tokens

Quando responder valores, mostre R$ formatado em pt-BR.
Quando responder data, formato dd/mm/aaaa.`;

// === HANDLER ===
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);

  // Auth: precisa de JWT válido (qualquer usuário autenticado pode usar)
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'sem auth' }, 401);
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { 'apikey': ANON, 'Authorization': auth } });
  if (!u.ok) return json({ error: 'jwt inválido' }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const userMessages = payload.messages || [];

  const enabledProviders = PROVIDERS.filter(p => p.enabled);
  if (!enabledProviders.length) return json({ error: 'nenhum provider de IA configurado' }, 500);

  // Conversation loop com tool calling — tenta cada provider em ordem
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  let lastError = '';

  for (const provider of enabledProviders) {
    try {
      // Até 5 rodadas de tool-calling
      for (let round = 0; round < 5; round++) {
        const resp = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 1024,
          }),
        });

        if (!resp.ok) {
          const t = await resp.text();
          lastError = `${provider.name} ${resp.status}: ${t.slice(0, 200)}`;
          break; // sai do loop interno e tenta próximo provider
        }

        const data = await resp.json();
        const choice = data.choices?.[0];
        const msg = choice?.message;
        if (!msg) {
          lastError = `${provider.name}: sem mensagem`;
          break;
        }

        messages.push(msg);

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
            let args = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
            const out = await runTool(tc.function.name, args);
            return { tool_call_id: tc.id, role: 'tool', name: tc.function.name, content: JSON.stringify(out) };
          }));
          messages.push(...results);
          continue;
        }

        // Resposta final — sucesso!
        return json({
          reply: msg.content,
          rounds: round + 1,
          provider: provider.name,
        });
      }
    } catch (e) {
      lastError = `${provider.name}: ${String(e)}`;
    }
  }

  return json({ error: 'todos providers falharam', details: lastError }, 500);
});
