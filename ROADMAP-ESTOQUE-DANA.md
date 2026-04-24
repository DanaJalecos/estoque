# ROADMAP — Sistema de Estoque Dana Jalecos

> **Objetivo:** transformar o `index.html` atual (sistema de estoque básico com Supabase + NF-e import) num sistema completo de controle de compras, estoque, fornecedores e produção — integrado com os dados do Bling (pedidos/produtos da Dana).

> **Localização do projeto:**
> `C:\Users\Juan - Dana Jalecos\Documents\Sistema Marketing\. ANALISE E PESQUISA\Tecidos Projeto\`

> **Arquivo principal:** `index.html` (2549 linhas, dark mode, auth + RLS + permissões)

---

## 📌 Contexto rápido pra próxima sessão

Esse sistema foi desenvolvido à parte do DMS (Dana Marketing System). O **DMS** roda em `https://dana-marketing.netlify.app` e tem o Bling sincronizado no Supabase `wltmiqbhziefusnzmmkt`. Esse sistema de **Estoque** roda num Supabase próprio (`jkvoqqqiwtpsruwoioxl`) e hoje NÃO conversa com o Bling/DMS.

A missão é integrar os dois — o estoque precisa saber o que a Dana tá vendendo pra prever consumo de matéria-prima com precisão.

### Tokens e acessos

**Arquivo único com todas as credenciais:**
```
C:\Users\Juan - Dana Jalecos\Documents\Sistema Marketing\. ANALISE E PESQUISA\Tecidos Projeto\TOKENS SUPABASE.txt
```

Esse arquivo contém (Juan adicionou):
- Credenciais do Supabase do **Estoque** (`jkvoqqqiwtpsruwoioxl`) — anon, service_role, PAT
- Credenciais do Supabase do **DMS** (`wltmiqbhziefusnzmmkt`) — pra ler dados do Bling da Matriz

> **Antes de qualquer query ao banco, LEIA esse arquivo** — ele contém as credenciais válidas.

### Dados do Bling já exportados (Matriz)

Já rodei um export inicial dos dados relevantes do Bling da **Matriz** (só Matriz, BC não é escopo) pra a pasta:
```
bling-matriz/
├── README.txt                                 — índice
├── _RESUMO.json                               — metadados + o que tem em cada arquivo
├── _schema_tabelas_relevantes.json            — schema da tabela produtos
├── 01_produtos_matriz.json / .csv             — 2.205 produtos do catálogo
├── 02_vendas_por_mes.json / .csv              — 13 meses de faturamento
├── 03_vendas_por_dia_da_semana.json / .csv    — padrão operacional
├── 04_trend_30_90_180_dias.json               — velocidade recente
├── 05_top_produtos_matriz.json / .csv         — 200 produtos mais vendidos
├── 06_top_produtos_por_mes_matriz.json / .csv — 4.938 linhas (série por SKU/mês)
├── 07_top_produtos_marketplaces.json / .csv   — 100 SKUs vendidos em marketplaces
└── 08_velocidade_vendas_90d.json / .csv       — projeção diária/mensal
```

Pra atualizar esses dados (ex: 1x/semana), rodar:
```
python .claude/scripts/exportar-bling-matriz.py
```

### Estrutura atual do `index.html`

**Sidebar (nav):**
1. Dashboard
2. Estoque
3. Alertas
4. Histórico
5. Cadastrar Produto (admin/estoquista)
6. Registrar Entrada (admin/estoquista) — com **importação de NF-e XML/PDF**
7. Registrar Saída
8. Compras (histórico de preços)
9. Previsões Futuras (admin)
10. Gerenciar Usuários (admin)
11. Meu Perfil

**Cargos:** admin, gerente, estoquista, costureira, user

**Banco de dados (Supabase `jkvoqqqiwtpsruwoioxl`):**
- `profiles` — usuários (id, nome, role)
- `fabrics` — produtos de estoque (nome, cor/variação, fornecedor [TEXT], unidade, min_stock, stock)
- `movements` — entradas/saídas (fabric_id, type, qty, date, detail, who)
- `purchases` — histórico de compras (fabric_id, supplier [TEXT], qty, unit_price, total, nf_number)
- `role_permissions` — matriz de permissões por cargo (JSONB)

---

## 🎯 Decisão estratégica: onde rodar o sistema final

### Opção A — manter sistema separado (atual)
✅ Prós: já funciona, não mexe no DMS
❌ Contras: 2 logins, 2 bancos, 2 infras, custo duplicado, dados desconectados

### Opção B — migrar pro DMS (recomendado)
✅ Prós: 1 login, 1 banco, cargos unificados, notificações compartilhadas, bot IA pode responder sobre estoque
❌ Contras: 1 dia de migração, precisa mapear usuários do Estoque pros profiles do DMS

### Opção C — manter separado MAS consumir dados do DMS
✅ Prós: intermediário, começa rápido, posso migrar depois
❌ Contras: duplica infra mas pelo menos o Bling é compartilhado

> **Recomendação:** começa com a **Opção C** (puxa dados do DMS via API), depois migra pra **Opção B** quando tudo tiver estabilizado.

---

## 📋 ROADMAP — 4 níveis

### 🥇 NÍVEL 1 — Fornecedores com categorias *(3-4h)*

**Por que começar aqui:** é o que o Juan pediu explicitamente, resolve um problema imediato (organização), e não precisa do Bling.

#### SQL novo

```sql
-- 1.1) Tabela de fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT,
  inscricao_estadual TEXT,

  -- Contato
  contato_nome TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  website TEXT,

  -- Endereço
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,

  -- O que fornece (multi-categoria)
  categorias TEXT[] NOT NULL DEFAULT '{}',
  -- valores permitidos: tecido, aviamento, embalagem, etiqueta,
  --                     linha, botao, zipper, papelaria, outro

  -- Comercial
  prazo_entrega_dias INT,
  condicoes_pagamento TEXT, -- '30/60/90', 'à vista 5% off', etc
  valor_minimo_pedido NUMERIC,

  -- Meta
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  avaliacao NUMERIC CHECK (avaliacao BETWEEN 0 AND 5), -- estrelas
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fornecedores_categorias ON fornecedores USING GIN(categorias);
CREATE INDEX idx_fornecedores_ativo ON fornecedores(ativo) WHERE ativo = true;

-- 1.2) Adicionar FK em fabrics (atual) e purchases
ALTER TABLE fabrics       ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES fornecedores(id);
ALTER TABLE fabrics       ADD COLUMN IF NOT EXISTS categoria TEXT; -- tecido/aviamento/embalagem/etc
ALTER TABLE purchases     ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES fornecedores(id);

-- 1.3) Migração de dados (copia supplier TEXT → fornecedores)
-- Executar 1x depois de criar a tabela
INSERT INTO fornecedores (nome, categorias)
SELECT DISTINCT TRIM(supplier), ARRAY['outro']::TEXT[]
FROM fabrics
WHERE COALESCE(TRIM(supplier),'') <> ''
ON CONFLICT DO NOTHING;

-- E vincular de volta
UPDATE fabrics SET fornecedor_id = f.id
FROM fornecedores f
WHERE TRIM(fabrics.supplier) = f.nome AND fabrics.fornecedor_id IS NULL;

UPDATE purchases SET fornecedor_id = f.id
FROM fornecedores f
WHERE TRIM(purchases.supplier) = f.nome AND purchases.fornecedor_id IS NULL;

-- 1.4) RLS
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos autenticados leem fornecedores" ON fornecedores FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/gerente CUD fornecedores" ON fornecedores FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerente'))
);

-- 1.5) Atualizar permissões padrão (adicionar 'fornecedores' na matriz)
UPDATE role_permissions
SET permissions = permissions || '{
  "admin":     {"fornecedores": true, "fornecedores_editar": true},
  "gerente":   {"fornecedores": true, "fornecedores_editar": true},
  "estoquista":{"fornecedores": true, "fornecedores_editar": false},
  "costureira":{"fornecedores": false,"fornecedores_editar": false}
}'::jsonb
WHERE id = 1;
```

#### Frontend — nova aba "Fornecedores"

Adicionar na sidebar (depois de "Compras"):
```html
<button data-perm="fornecedores" onclick="showPage('fornecedores',this)">
  <span class="icon">🏭</span> Fornecedores
</button>
```

Nova page `<div id="page-fornecedores">`:
- **Stats cards:** total de fornecedores, ativos, por categoria (pizza chart)
- **Filtros:** categoria (dropdown multi), ativo (checkbox), busca por nome/CNPJ
- **Tabela:** nome, categorias (badges coloridas), cidade/UF, prazo, último pedido, ação (editar/desativar)
- **Modal Novo Fornecedor:** formulário com todos os campos, CNPJ com máscara + validação
- **Drawer Detalhe:**
  - Aba "Dados" — formulário de edição
  - Aba "Produtos que fornece" — lista de `fabrics` onde `fornecedor_id = X`
  - Aba "Histórico de compras" — `purchases` desse fornecedor + gráfico de preço ao longo do tempo
  - Aba "Contato rápido" — botão WhatsApp direto, email

#### Integração no fluxo atual

- **Cadastrar Produto:** trocar campo `supplier` input livre por dropdown de fornecedores cadastrados + opção "+ Novo" que abre modal rápido
- **Registrar Entrada:** quando importar NF-e, tentar vincular automaticamente pelo CNPJ do emitente (se já existe fornecedor com aquele CNPJ → usa; senão → sugere criar)
- **Dashboard:** novo card "Próxima compra sugerida" mostrando fornecedores com produtos em alerta

---

### 🥈 NÍVEL 2 — Integração com Bling da MATRIZ via DMS *(1-2 dias)*

> **Escopo:** apenas empresa **Matriz**. BC fica fora desse roadmap.
> O sistema de estoque controla a produção/matéria-prima da Matriz.

**Por que importa:** sem isso, "Previsões Futuras" é chute. Com isso, o sistema sabe exatamente quanto oxford vai sair semana que vem baseado nos pedidos reais da Matriz.

#### Descoberta importante sobre o schema DMS

Ao investigar o schema do Supabase DMS (`wltmiqbhziefusnzmmkt`), descobri que:

- ✅ **Tem `produtos`** (2.205 produtos no catálogo da Matriz)
- ❌ **Não tem `pedido_itens`** (breakdown item-a-item não está sincronizado no banco)
- ✅ **Tem views agregadas prontas** que substituem: `top_produtos`, `top_produtos_mes`, `top_produtos_marketplaces`

As views já dão o agregado necessário. Os arquivos na pasta `bling-matriz/` são o snapshot inicial dessas views filtradas por `empresa='matriz'`.

#### Caminho recomendado

**Opção A (rápida, que já funciona):** O Estoque consulta diretamente o Supabase DMS usando as **views `top_produtos*`** (já existem, apenas filtrar `empresa='matriz'`).

```javascript
// No index.html do Estoque
const DMS_URL = 'https://wltmiqbhziefusnzmmkt.supabase.co';
const DMS_ANON = '<ler de TOKENS SUPABASE.txt>';
const dmsClient = supabase.createClient(DMS_URL, DMS_ANON);

async function sincronizarVendasMatriz() {
  // Top produtos dos últimos 90 dias (só Matriz)
  const { data, error } = await dmsClient
    .from('top_produtos_mes')
    .select('ano,mes,produto,total_pedidos,total_quantidade,total_receita,preco_medio')
    .eq('empresa', 'matriz');

  if (error) { console.error(error); return; }

  // Agrega 30/90 dias por SKU
  const cache = new Map();
  const hoje = new Date();
  for (const row of data) {
    const dataRow = new Date(row.ano, row.mes - 1, 1);
    const diasAtras = (hoje - dataRow) / 86400000;
    if (diasAtras > 180) continue;

    const m = cache.get(row.produto) || {
      produto: row.produto,
      vendido_30d: 0, vendido_90d: 0, vendido_180d: 0,
      receita_180d: 0, preco_medio: row.preco_medio
    };
    if (diasAtras <= 30)  m.vendido_30d  += +row.total_quantidade;
    if (diasAtras <= 90)  m.vendido_90d  += +row.total_quantidade;
    m.vendido_180d += +row.total_quantidade;
    m.receita_180d += +row.total_receita;
    cache.set(row.produto, m);
  }

  // Upsert no cache local do Estoque
  for (const v of cache.values()) {
    await sb.from('vendas_bling_cache').upsert({
      produto_nome: v.produto,  // MATCH pelo nome do produto (não tem SKU na view)
      vendido_30d: v.vendido_30d,
      vendido_90d: v.vendido_90d,
      vendido_180d: v.vendido_180d,
      receita_180d: v.receita_180d,
      preco_medio: v.preco_medio,
      atualizado_em: new Date().toISOString(),
    });
  }
}
```

> ⚠️ **Atenção na chave de cruzamento:** as views `top_produtos*` usam o CAMPO `produto` (texto com descrição) como identificador — não tem `codigo`/SKU. Se quiser SKU, puxar direto da tabela `produtos` do DMS e juntar por descrição (ou pedir pra Juan sincronizar SKU nas views).

**Opção B (melhor):** Pedir pra eu criar uma view nova no DMS já com JOIN pra trazer o SKU:
```sql
-- No DMS (wltmiqbhziefusnzmmkt)
CREATE OR REPLACE VIEW vendas_matriz_com_sku AS
SELECT
  tpm.ano, tpm.mes,
  prod.codigo AS sku,
  tpm.produto AS descricao,
  tpm.total_pedidos, tpm.total_quantidade, tpm.total_receita, tpm.preco_medio
FROM top_produtos_mes tpm
LEFT JOIN produtos prod
       ON UPPER(TRIM(prod.nome)) = UPPER(TRIM(tpm.produto))
      AND prod.empresa = 'matriz'
WHERE tpm.empresa = 'matriz';
```

**Tabela local de cache no Estoque:**
```sql
CREATE TABLE IF NOT EXISTS vendas_bling_cache (
  produto_nome TEXT PRIMARY KEY,
  sku TEXT,
  vendido_30d NUMERIC DEFAULT 0,
  vendido_90d NUMERIC DEFAULT 0,
  vendido_180d NUMERIC DEFAULT 0,
  receita_180d NUMERIC DEFAULT 0,
  preco_medio NUMERIC,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendas_bling_cache_sku ON vendas_bling_cache(sku);
```

Atualização: cron cada 6h ou botão manual "🔄 Atualizar dados do Bling" no Dashboard.

#### Usando os arquivos JÁ EXPORTADOS

A pasta `bling-matriz/` tem um snapshot pronto. Pra iniciar **sem precisar nem conectar no DMS**:

1. Importar `01_produtos_matriz.csv` direto como dados iniciais de `vendas_bling_cache`
2. Usar `05_top_produtos_matriz.csv` como seed da lista de SKUs pra criar fichas técnicas
3. Usar `06_top_produtos_por_mes_matriz.csv` pra alimentar o primeiro gráfico de trend no Dashboard
4. Usar `08_velocidade_vendas_90d.csv` pra calcular `dias_de_cobertura` de cada matéria-prima na primeira demo

---

### 🥉 NÍVEL 3 — Ficha técnica (BOM — Bill of Materials) *(2 dias)*

**Pra quê:** cruzar vendas do Bling com consumo de matéria-prima. Aqui mora a inteligência do sistema.

#### SQL

```sql
-- Ficha técnica: cada produto do Bling consome X de cada fabric
CREATE TABLE IF NOT EXISTS ficha_tecnica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_sku TEXT NOT NULL,              -- SKU do Bling
  produto_descricao TEXT,                  -- cache do nome pra facilitar
  fabric_id UUID NOT NULL REFERENCES fabrics(id) ON DELETE CASCADE,
  quantidade NUMERIC NOT NULL,             -- ex: 2.3 (metros)
  unidade TEXT NOT NULL,                   -- ex: 'metros'
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(produto_sku, fabric_id)
);

CREATE INDEX idx_ficha_tecnica_sku ON ficha_tecnica(produto_sku);
CREATE INDEX idx_ficha_tecnica_fabric ON ficha_tecnica(fabric_id);

-- View de consumo projetado
CREATE OR REPLACE VIEW consumo_projetado AS
SELECT
  f.id as fabric_id,
  f.name as fabric_name,
  f.color,
  f.stock as estoque_atual,
  f.min_stock,
  COALESCE(SUM(ft.quantidade * v.vendido_30d / 30), 0) AS consumo_diario_projetado,
  COALESCE(SUM(ft.quantidade * v.vendido_30d), 0) AS consumo_mensal_projetado,
  CASE
    WHEN COALESCE(SUM(ft.quantidade * v.vendido_30d / 30), 0) > 0
    THEN f.stock / (SUM(ft.quantidade * v.vendido_30d / 30))
    ELSE NULL
  END AS dias_de_cobertura
FROM fabrics f
LEFT JOIN ficha_tecnica ft ON ft.fabric_id = f.id
LEFT JOIN vendas_bling_cache v ON v.sku = ft.produto_sku
GROUP BY f.id, f.name, f.color, f.stock, f.min_stock;
```

#### Frontend — nova aba "Ficha Técnica"

Modal para cada produto do Bling (SKU), configurar os fabrics consumidos + quantidades.

Interface sugerida:
```
Produto (Bling): [ Jaleco Feminino Branco M  ▼ ]
                  SKU: JAL-FEM-BRC-M  ·  vendido 30d: 42 un

Matéria-prima:
  ┌──────────────────────────────────┬────────┬────────┐
  │ Oxford Branco                    │ 2.30   │ metros │  [─]
  │ Linha Branca (4000m)             │ 1/50   │ rolos  │  [─]
  │ Botão 18mm                       │ 8      │ un     │  [─]
  │ Embalagem plástica M             │ 1      │ un     │  [─]
  └──────────────────────────────────┴────────┴────────┘  [+ Adicionar]

Consumo esperado próximos 30 dias:
  • 96,6m oxford branco (estoque atual: 50m) ⚠️
  • 0,84 rolos de linha
  • 336 botões
```

#### Nova view do Dashboard

- **"Alerta de matéria-prima pra vendas futuras"**: qualquer fabric com `dias_de_cobertura < 14` aparece em vermelho
- **Gráfico**: consumo projetado vs estoque atual (barras duplas)

---

### 🎨 NÍVEL 4 — Features bonitão *(2-3 dias extra)*

Lista de melhorias opcionais, priorizadas por impacto:

#### 4.1 — Desconto automático do estoque quando Bling vende
Webhook ou cron no Supabase:
1. Escuta novos pedidos em `pedidos` do DMS
2. Pra cada item do pedido, consulta `ficha_tecnica` via SKU
3. Cria entrada em `movements` tipo='saida' com qty = ficha × pedido
4. `fabrics.stock` atualiza automaticamente

Economiza "Registrar Saída" manual pra cada jaleco vendido.

#### 4.2 — Pedido de Compra (Purchase Order) pro fornecedor
- Gerar PDF estruturado com logo Dana + CNPJ + lista de itens + prazo
- Botão "Enviar WhatsApp" com mensagem pronta
- Status: rascunho → enviado → confirmado → recebido (fecha e gera entrada automática)

#### 4.3 — Histórico comparativo de preços
Na aba "Compras", adicionar:
- Gráfico de preço do mesmo produto ao longo do tempo (linha)
- Alerta automático: "Oxford Branco subiu 18% desde última compra"
- Comparar preço de 2+ fornecedores pro mesmo produto

#### 4.4 — Código de barras + câmera celular
- Cada rolo de tecido ganha etiqueta com QR code gerado no sistema
- Na tela de Registrar Saída (mobile), botão "📷 Escanear" usa HTML5 `getUserMedia()`
- Escaneou → produto já selecionado, só informar qty

#### 4.5 — Foto do produto
- Upload para Supabase Storage bucket `fabrics-fotos`
- Thumbnail na listagem do estoque
- Gallery no detalhe

#### 4.6 — Timeline unificada
Num dashboard só:
```
Hoje (24/04)
├─ 📥 Entrou: 200m Oxford Branco (Têxtil SP · NF 4312)
├─ 📦 Produção: 15 jalecos consumiram 34m Oxford
└─ 🛒 Vendeu: 12 jalecos (Bling) → baixa automática

Ontem (23/04)
├─ 🛒 Vendeu: 18 jalecos (estoque cobre 30 dias)
└─ ⚠️ Alerta: Botão 18mm chegou em 50 un (mínimo: 100)
```

---

## 🔧 CHECKLIST DE EXECUÇÃO

### Fase 0 — Preparação (30min)
- [ ] Ler `SUPABASE_ESTOQUE_TOKEN.txt` (PAT + service_role)
- [ ] Ler `SUPABASE_DMS_TOKEN.txt` (pra acessar dados do Bling)
- [ ] Confirmar que o `index.html` atual está rodando e backup existe
- [ ] `git init` na pasta do Tecidos Projeto se ainda não tem
- [ ] Criar `.gitignore` pra excluir `*TOKEN*.txt`

### Fase 1 — Fornecedores (3-4h)
- [ ] Rodar SQL de criação da tabela `fornecedores` + FKs + migração
- [ ] Criar `setup-v6-fornecedores.sql` com o SQL documentado
- [ ] Adicionar aba "Fornecedores" na sidebar do `index.html`
- [ ] Implementar CRUD + filtros + tabela + modal novo
- [ ] Implementar drawer detalhe (3 abas: dados, produtos, compras)
- [ ] Trocar input livre de supplier pelos dropdowns em Cadastrar/Entrada/Compras
- [ ] Integrar com import NF-e: detectar CNPJ do emitente → vincular fornecedor
- [ ] Atualizar permissões no `role_permissions`
- [ ] Testar com user admin + estoquista + costureira
- [ ] Commit + backup

### Fase 2 — Bling via DMS (1-2 dias)
- [ ] Inspecionar schema DMS: quais tabelas têm pedidos, produtos, itens
- [ ] Decidir método de acesso (view pública, edge function, ou consulta direta)
- [ ] Criar tabela `vendas_bling_cache` no Estoque
- [ ] Criar edge function ou cron de sync (1x/hora)
- [ ] UI: card no Dashboard mostrando vendas dos últimos 30d
- [ ] Permitir filtrar produtos por categoria do Bling
- [ ] Testar com dados reais

### Fase 3 — Ficha Técnica (2 dias)
- [ ] Rodar SQL `ficha_tecnica` + view `consumo_projetado`
- [ ] Nova aba "Fichas Técnicas" com busca por SKU
- [ ] Modal de edição: lista de fabrics + quantidade + unidade
- [ ] View `consumo_projetado` integrada no Dashboard e Alertas
- [ ] Coluna "dias de cobertura" na tabela de estoque
- [ ] Alerta automático quando cobertura < 14 dias

### Fase 4 — Features bonitão (iterativo)
- [ ] Desconto automático via webhook de `pedidos`
- [ ] Pedido de Compra PDF + WhatsApp
- [ ] Gráfico de preço histórico
- [ ] QR code + leitor mobile
- [ ] Foto produto
- [ ] Timeline unificada

### Fase 5 — Consolidação (opcional, 1 dia)
- [ ] Migrar TUDO pro Supabase DMS (`wltmiqbhziefusnzmmkt`)
- [ ] Criar schema separado `estoque.*` pra não misturar com DMS
- [ ] Unificar autenticação (estoquista vira cargo no DMS)
- [ ] Redirect do domínio atual pro novo

---

## 💡 Exemplos de código prontos

### Ex 1 — Categoria de fornecedor com badges coloridos

```javascript
const CATEGORIAS = {
  tecido:     { label: 'Tecido',     cor: '#3b82f6', icon: '🧵' },
  aviamento:  { label: 'Aviamento',  cor: '#a855f7', icon: '🧷' },
  embalagem:  { label: 'Embalagem',  cor: '#10b981', icon: '📦' },
  etiqueta:   { label: 'Etiqueta',   cor: '#f59e0b', icon: '🏷️' },
  linha:      { label: 'Linha',      cor: '#ec4899', icon: '🧶' },
  botao:      { label: 'Botão',      cor: '#06b6d4', icon: '⭕' },
  zipper:     { label: 'Zíper',      cor: '#64748b', icon: '⚡' },
  papelaria:  { label: 'Papelaria',  cor: '#8b5cf6', icon: '📝' },
  outro:      { label: 'Outro',      cor: '#71717a', icon: '📌' },
};

function renderCategoriaBadges(cats) {
  return (cats || []).map(c => {
    const m = CATEGORIAS[c] || CATEGORIAS.outro;
    return `<span style="display:inline-block;padding:2px 8px;
      background:${m.cor}20;color:${m.cor};border:1px solid ${m.cor}50;
      border-radius:999px;font-size:11px;font-weight:600;margin-right:4px">
      ${m.icon} ${m.label}
    </span>`;
  }).join('');
}
```

### Ex 2 — Cruzar NF-e com fornecedores existentes

```javascript
// No handleNFUpload, após extrair emitente:
async function vincularFornecedorPorCNPJ(cnpj, emitente) {
  const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
  if (!cnpjLimpo) return null;

  // Procura fornecedor existente pelo CNPJ
  const { data: existente } = await sb
    .from('fornecedores')
    .select('id, nome, categorias')
    .eq('cnpj', cnpjLimpo)
    .maybeSingle();

  if (existente) return existente.id;

  // Sugere criar um novo
  const { data: novo, error } = await sb.from('fornecedores').insert({
    nome: emitente.razao_social || emitente.nome,
    cnpj: cnpjLimpo,
    endereco: emitente.endereco,
    cidade: emitente.cidade,
    uf: emitente.uf,
    categorias: ['outro'], // user classifica depois
  }).select('id').single();
  if (error) return null;

  showToast(`Novo fornecedor "${novo.nome}" cadastrado. Classifique as categorias!`);
  return novo.id;
}
```

### Ex 3 — Puxar vendas do Bling via DMS

```javascript
// Opção C: consulta direta ao DMS com anon key
const DMS_URL = 'https://wltmiqbhziefusnzmmkt.supabase.co';
const DMS_ANON = '<ler de SUPABASE_DMS_TOKEN.txt>';
const dmsClient = supabase.createClient(DMS_URL, DMS_ANON);

async function sincronizarVendasBling() {
  // Pega últimos 90 dias agregados por SKU
  const { data, error } = await dmsClient
    .from('vendas_para_estoque')  // view criada no DMS
    .select('sku, descricao, categoria, quantidade, data')
    .gte('data', new Date(Date.now() - 90*86400*1000).toISOString().slice(0,10));

  if (error) { console.error(error); return; }

  // Agrega por SKU
  const map = new Map();
  for (const row of data) {
    const m = map.get(row.sku) || { sku: row.sku, d30: 0, d90: 0, nome: row.descricao };
    const diasAtras = (Date.now() - new Date(row.data).getTime()) / 86400000;
    if (diasAtras <= 30) m.d30 += +row.quantidade;
    m.d90 += +row.quantidade;
    map.set(row.sku, m);
  }

  // Upsert no cache local
  for (const v of map.values()) {
    await sb.from('vendas_bling_cache').upsert({
      sku: v.sku,
      descricao: v.nome,
      vendido_30d: v.d30,
      vendido_90d: v.d90,
      atualizado_em: new Date().toISOString(),
    });
  }
}
```

---

## 📦 Estrutura da pasta

Tudo que precisa pra próxima sessão já está (ou será criado):

```
Tecidos Projeto/
├── index.html                            # principal (atual)
├── sistema-estoque.html                  # copia (atual)
├── proposta.html                         # atual
│
├── TOKENS SUPABASE.txt                   # ← credenciais (Juan adicionou)
│
├── ROADMAP-ESTOQUE-DANA.md               # este arquivo (roadmap completo)
│
├── bling-matriz/                         # snapshot já pronto dos dados Bling Matriz
│   ├── README.txt
│   ├── _RESUMO.json
│   ├── _schema_tabelas_relevantes.json
│   ├── 01_produtos_matriz.json/.csv        (2.205 produtos do catálogo)
│   ├── 02_vendas_por_mes.json/.csv         (trend 13 meses)
│   ├── 03_vendas_por_dia_da_semana.json/.csv
│   ├── 04_trend_30_90_180_dias.json
│   ├── 05_top_produtos_matriz.json/.csv    (200 SKUs mais vendidos)
│   ├── 06_top_produtos_por_mes_matriz.json/.csv  (4.938 linhas série temporal)
│   ├── 07_top_produtos_marketplaces.json/.csv
│   └── 08_velocidade_vendas_90d.json/.csv  (projeção diária/mensal)
│
├── setup-supabase.sql                    # v1 (atual)
├── setup-v2.sql                          # v2 (atual)
├── setup-v3-cargos.sql                   # v3 (atual)
├── setup-v4-compras.sql                  # v4 (atual)
├── setup-v5-permissoes.sql               # v5 (atual)
├── setup-v6-fornecedores.sql             # ← CRIAR (Fase 1)
├── setup-v7-bling-cache.sql              # ← CRIAR (Fase 2)
├── setup-v8-ficha-tecnica.sql            # ← CRIAR (Fase 3)
│
└── .gitignore                            # já protege TOKENS*.txt
```

**Pra atualizar o snapshot `bling-matriz/`** (rodar manualmente quando quiser refresh):
```
python .claude/scripts/exportar-bling-matriz.py
```

---

## 🎯 Definição de "pronto"

Sistema considerado 100% completo quando:

1. ✅ Aba Fornecedores com categorização funcionando + CNPJ + histórico por fornecedor
2. ✅ Cada produto tem categoria definida (tecido / aviamento / embalagem / etc)
3. ✅ Importação NF-e auto-vincula fornecedor por CNPJ
4. ✅ Vendas do Bling da **Matriz** refletem no Dashboard (últimos 30d + trend)
5. ✅ Ficha técnica preenchida pros 10 produtos mais vendidos da **Matriz**
6. ✅ Dashboard mostra "dias de cobertura" por fabric
7. ✅ Alerta dispara quando cobertura < 14 dias
8. ✅ Pedido de venda (Bling) → desconto automático do estoque via webhook
9. ✅ Export PDF de Pedido de Compra pro fornecedor
10. ✅ Comparador de preço histórico funcional

---

## 🚨 IMPORTANTE pra próxima sessão

- **Faça sempre backup do `index.html` antes de mexer**: `cp index.html index.html.backup-YYYYMMDD`
- **Nunca commite os `*TOKEN*.txt`** — adicione no `.gitignore`
- **Teste cada fase isoladamente** com user admin antes de ir pra próxima
- **Migrations são aditivas** (`CREATE TABLE IF NOT EXISTS`, `ALTER ADD COLUMN IF NOT EXISTS`) — seguro rodar múltiplas vezes
- **O Supabase do Estoque é `jkvoqqqiwtpsruwoioxl`** (diferente do DMS `wltmiqbhziefusnzmmkt`) — cuidado pra não rodar SQL no projeto errado

---

## Histórico deste documento

- **24/04/2026** — criado pelo Juan + Claude após análise completa do sistema atual. Define os 4 níveis de evolução e o plano de migração opcional pro DMS.
