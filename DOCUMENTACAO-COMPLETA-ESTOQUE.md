# DOCUMENTAÇÃO COMPLETA — Sistema de Estoque Dana Jalecos

> **Última atualização:** 27/04/2026 noite — ciclo 17 (Bot IA + UX profissional + auditorias)
> **Repo GitHub (oficial):** https://github.com/DanaJalecos/estoque
> **Site público:** https://danajalecos.github.io/estoque/
> **Repo antigo (arquivado/privado):** ~~zJu4nnIA/dana-jalecos-estoque~~
> **Localização local:** `C:\Users\Juan - Dana Jalecos\Documents\Sistema Marketing\. Outro sistema\Tecidos Projeto\`
> **Supabase:** `jkvoqqqiwtpsruwoioxl` ("Sistema Controle de Estoque/Compras")
> **Stack:** Single-page HTML + Supabase (Auth + Postgres + Realtime + Storage + Edge Functions Deno) + IA (Groq Llama 3.3)

---

## 0. ÍNDICE

1. [Visão geral](#1-visão-geral)
2. [Estrutura de arquivos](#2-estrutura-de-arquivos)
3. [Autenticação e cargos](#3-autenticação-e-cargos)
4. [Sidebar (organização das páginas)](#4-sidebar)
5. [Schema do banco de dados](#5-schema)
6. [Tabelas de cache do Bling](#6-bling-cache)
7. [Fornecedores (com IA + telefones via Bling)](#7-fornecedores)
8. [Matéria-prima (fabrics) + histórico de compras](#8-matéria-prima)
9. [Ficha técnica (BOM)](#9-ficha-técnica)
10. [Saída por Produção](#10-saída-por-produção)
11. [Páginas e fluxos](#11-páginas)
12. [Integrações com Bling](#12-bling)
13. [Tokens e credenciais](#13-tokens)
14. [Scripts de import/manutenção](#14-scripts)
15. [Pendências e roadmap](#15-pendências)

---

## 1. VISÃO GERAL

Sistema interno da Dana Jalecos pra **controle completo de estoque/produção**, integrado com o Bling (ERP) da empresa.

### O que faz

| Função | Detalhe |
|---|---|
| **Cadastro de matéria-prima** | tecidos, aviamentos, embalagens, etiquetas, linhas, etc |
| **Movimentação** | entradas (compras) e saídas (consumo na produção) |
| **Fornecedores** | importados do Bling com CNPJ, endereço, telefone, categoria |
| **Compras** | histórico de NFes com preço, comparação mês-a-mês |
| **Ficha técnica** | 50 produtos com BOM (matéria-prima necessária por unidade) |
| **Saída por produção** | escolhe produto + qtd → desconta automaticamente toda matéria-prima da ficha |
| **Cruzamento Bling** | vendas dos últimos 90 dias por SKU pra projetar consumo |
| **Alertas** | itens em cobertura crítica, estoque baixo, etc |
| **Importação NF-e** | XML/PDF com extração automática de itens |

### Ciclo completo coberto

```
COMPRA (Bling)              PRODUÇÃO              VENDA (Bling)
    ↓                           ↓                      ↓
Fornecedores ←→ NF-e          Saída por             Vendas/SKU
                ↓             Produção                 ↑
            +Estoque             ↓                  Projeção
                              -Estoque              consumo
                                 ↓
                              Histórico
```

---

## 2. ESTRUTURA DE ARQUIVOS

```
Tecidos Projeto/
├── index.html                     # Aplicação principal (SPA, ~3500 linhas)
├── sistema-estoque.html           # Cópia legacy — não usada
├── proposta.html                  # Página estática institucional
├── DOCUMENTACAO-COMPLETA-ESTOQUE.md  # ESTE arquivo
├── ROADMAP-ESTOQUE-DANA.md        # Roadmap original (já cumprido em ~80%)
├── INSTRUCOES-PROXIMA-SESSAO.txt  # Brief pra LLMs futuras
│
├── TOKENS SUPABASE.txt            # ⚠️ Credenciais (gitignore)
├── TOKEN GITHUB.txt               # ⚠️ PAT GitHub (gitignore)
│
├── assets/                        # Logos
│   ├── logo-icon.png              # Brasão/coroa solo (favicon + tela login)
│   └── logo-horizontal.png        # Logo "DANA · JALECOS EXCLUSIVOS"
│
├── ITENS/                         # Materiais originais (reference)
│   ├── CUSTO PRODUTOS GERAL ATUALIZADO 13.08.xlsx  # 50 abas com BOM
│   ├── LOGO SOZINHA BRANCA.png
│   └── Principal Horizontal Branca.png
│
├── bling-matriz/                  # Snapshots dos dados Bling (rodando script)
│   ├── 01_produtos_matriz.json/csv         # 2.205 produtos catálogo
│   ├── 02_vendas_por_mes.json/csv          # trend 13 meses
│   ├── 05_top_produtos_matriz.json/csv     # 200 SKUs mais vendidos
│   ├── 06_top_produtos_por_mes_matriz.*    # série temporal SKU×mês
│   ├── 09_fornecedores_bling.json/csv      # 282 contatos tipo "Fornecedor"
│   ├── 10_fornecedores_marco.json          # filtrados março compra
│   ├── 11_fornecedores_abril.json          # consolidado mar+abr
│   ├── 12_check_abril_novidades.json       # validação
│   ├── _schema_tabelas_relevantes.json
│   └── README.txt
│
├── setup-supabase.sql             # v1: fabrics + movements
├── setup-v2.sql                   # v2: profiles + auth
├── setup-v3-cargos.sql            # v3: cargos
├── setup-v4-compras.sql           # v4: purchases
├── setup-v5-permissoes.sql        # v5: role_permissions
├── setup-v6-fornecedores.sql      # v6: fornecedores + categorias
├── setup-v7-bling-cache.sql       # v7: bling_* cache tables
└── setup-v8-ficha-tecnica.sql     # v8: ficha_produtos + ficha_tecnica
```

> **Os scripts Python de import** ficam fora desta pasta (em `.claude/scripts/` da pasta DMS) por organização.

---

## 3. AUTENTICAÇÃO E CARGOS

### Login

- **Tela de login** com logo da Dana (icon + horizontal)
- Tabs: Entrar / Criar Conta
- "Esqueci minha senha" via email Supabase
- Trial: profile setup (nome de exibição) na primeira vez

### Cargos disponíveis

| Cargo | Descrição |
|---|---|
| `admin` | acesso total |
| `gerente` | tudo exceto admin/usuários |
| `estoquista` | operação diária (entrada, saída, estoque, compras) |
| `costureira` | só consulta + Saída por Produção |
| `user` | bloqueado/sem acesso |

### Matriz de permissões (`role_permissions`)

JSONB com chaves por cargo. Admin pode editar via interface (Gerenciar Usuários → Permissões por Cargo).

Permissões-chave:
- `dashboard`, `estoque`, `alertas`, `historico`
- `cadastro` (cadastrar produto)
- `entrada`, `saida` (movimentações)
- `compras`, `fornecedores`, `fornecedores_editar`
- `ficha`, `ficha_editar` (ficha técnica)
- `bling` (vendas Bling)
- `excluir_mov` (apagar movimentações antigas)

### RLS (Row Level Security)

Todas tabelas têm RLS habilitado. Policies geralmente:
- **SELECT** → autenticados (`auth.uid() IS NOT NULL`)
- **INSERT/UPDATE** → admin/gerente
- **DELETE** → só admin

---

## 4. SIDEBAR

Reorganizada em 7 grupos lógicos:

```
VISÃO GERAL
  📊 Dashboard
  ⚠️ Alertas

ESTOQUE
  🧵 Matéria-prima
  📜 Histórico
  📝 Cadastrar Produto

MOVIMENTAR
  📥 Registrar Entrada
  📤 Registrar Saída

COMPRAS
  💰 Histórico Compras
  🏭 Fornecedores
  🔮 Previsões Futuras (admin)

PRODUÇÃO
  🧬 Ficha Técnica
  📈 Vendas (Bling)

ADMINISTRAÇÃO (admin)
  👥 Gerenciar Usuários

CONTA
  👤 Meu Perfil
```

`navBtn(page)` busca pelo `onclick` (não depende de ordem).

---

## 5. SCHEMA DO BANCO DE DADOS

### Tabelas principais

#### `profiles` — usuários
- `id` UUID (FK auth.users)
- `display_name` TEXT
- `role` TEXT (admin/gerente/estoquista/costureira/user)
- `created_at`

#### `role_permissions` — matriz de permissões
- `id` INT (sempre 1, singleton)
- `permissions` JSONB (ex: `{"gerente": {"compras": true, ...}}`)

#### `fabrics` — matéria-prima
- `id` UUID
- `user_id`, `name`, `color`, `supplier` (legado)
- `unit` TEXT (`metros` | `unidades` | `kg` | etc)
- `min_stock`, `stock` NUMERIC
- `fornecedor_id` UUID → fornecedores
- `categoria` TEXT (tecido/aviamento/etc)
- `created_at`

#### `movements` — entradas e saídas
- `id` UUID
- `fabric_id` UUID → fabrics
- `type` TEXT (`entrada` | `saida`)
- `qty` NUMERIC
- `date` DATE
- `detail` TEXT
- `who` TEXT
- `user_id`, `created_at`

#### `purchases` — histórico de compras (com preço)
- `id` UUID
- `fabric_id`, `fornecedor_id`
- `supplier` TEXT (legado)
- `qty`, `unit_price`, `total_price`
- `date` DATE
- `nf_number` TEXT
- `notes`, `user_id`, `created_at`

#### `fornecedores` — cadastro completo
```sql
id UUID PRIMARY KEY
nome TEXT
razao_social TEXT
cnpj TEXT
cnpjs_adicionais TEXT[]              -- multi-CNPJ (filiais consolidadas)
inscricao_estadual TEXT
contato_nome, telefone, whatsapp, email, website TEXT
endereco, cidade, uf, cep TEXT
categorias TEXT[]                     -- {tecido,aviamento,...}
naturezas_operacao TEXT[]             -- {Compra p/ Industrialização,...}
prazo_entrega_dias INT
condicoes_pagamento TEXT
valor_minimo_pedido NUMERIC
itens_comprados TEXT[]                -- snapshot dos SKUs
total_compras_valor NUMERIC
total_compras_nfe INT
ultima_compra DATE
observacoes TEXT
ativo BOOLEAN
avaliacao NUMERIC (0-5)
```

#### `ficha_produtos` — header dos 50 produtos
- `codigo` PK (`375-ADA`, `080-SCRUB LOREN`, ...)
- `nome` TEXT
- `tipo` TEXT (`Jaleco` | `Scrub` | `Avental` | `Dolma` | `Macacão` | `Gorro` | `Acessório` | `Home` | `Outro`)
- `bling_codigo_pattern` TEXT
- `custo_total` NUMERIC (cache, recalculado por trigger)
- `total_itens` INT
- `preco_venda_estimado` NUMERIC (futuro)
- `ativo`, `observacoes`

#### `ficha_tecnica` — itens (BOM)
- `id` UUID
- `produto_codigo` → ficha_produtos
- `ordem` INT
- `item_descricao` TEXT (ex: "Tecido - Gabardine")
- `fabric_id` UUID → fabrics (vínculo com matéria-prima real)
- `quantidade`, `unidade`, `custo_unitario`
- `custo_total` GENERATED (qtd × custo)
- UNIQUE(produto_codigo, item_descricao)

### Trigger automático

`trg_ficha_tec_aiu` — após INSERT/UPDATE/DELETE em `ficha_tecnica`, recalcula `ficha_produtos.custo_total` e `total_itens`.

### Views derivadas

#### `vendas_por_codigo_ficha`
Cruza `ficha_produtos` com `bling_velocidade_90d`:
- `codigo`, `nome`, `qtd_vendida_90d`, `media_diaria`, `projecao_mensal`

Match fuzzy: `bling_velocidade_90d.produto ILIKE '%' || codigo || '%'`

#### `consumo_projetado`
Cruza `ficha_tecnica` × `vendas_por_codigo_ficha`:
- `fabric_id`, `fabric_name`, `estoque_atual`, `consumo_30d_projetado`, `dias_de_cobertura`

Usado pra alertar quando matéria-prima vai acabar.

---

## 6. BLING CACHE

8 tabelas que armazenam snapshot dos dados do Bling Matriz (vindos do DMS Supabase `wltmiqbhziefusnzmmkt`).

| Tabela | Conteúdo | Rows |
|---|---|---|
| `bling_produtos` | catálogo | 2.205 |
| `bling_top_produtos` | top 200 vendidos | 200 |
| `bling_produto_mes` | série temporal por SKU/mês | 4.938 |
| `bling_vendas_mes` | trend macro mensal | 13 |
| `bling_velocidade_90d` | top 100 com média diária | 100 |
| `bling_trend_periodo` | 30d/90d/180d agregado | 3 |
| `bling_vendas_dia_semana` | padrão operacional | 7 |
| `bling_sync_meta` | timestamp último sync | 1 |

**Fonte:** views do DMS `top_produtos`, `top_produtos_mes`, etc — filtradas `empresa='matriz'`.

**Atualização:** botão "🔄 Atualizar do Bling" na página Vendas (atualmente stub — precisa implementar com anon key DMS ou edge function pública).

---

## 7. FORNECEDORES

### Estado atual: **31 fornecedores**

Importados de NF-e entrada do Bling (Matriz) março+abril/2026:
- 75 NFes processadas (62 mar + 13 abr)
- 47 NFes válidas (29 industrialização + 18 uso/consumo)
- 28 puladas (devolução, estorno, remessa)

### Categorias (via Groq Llama 3.3 IA)

| Categoria | Qtd | Top |
|---|---|---|
| 🧵 **tecido** | 10 | EXCIM (R$ 125k), SOUL (R$ 66k), Peak (R$ 47k), Coretex (R$ 16k) |
| 🧷 **aviamento** | 7 | AVIAMENTOS BRUSQUE, ARCHNEER, PJPB Elásticos, VIVER METAIS |
| 📦 **embalagem** | 2 | ABSHOP, EHF |
| 🏷️ **etiqueta** | 2 | MTAG, PUBLI HOUSE |
| 🧶 **linha** | 1 | SANCRIS |
| ⚡ **zipper** | 1 | SANCRIS |
| ⭕ **botão** | 1 | Brasil Botões |
| 📝 **papelaria** | 3 | GCE Papéis, COMANDOLLI, EPM Toner |
| 📌 **outro** | 7 | ALZ Eletrônicos, L3000 Álcool, MOVEIS CARRARO, etc |

### Consolidação automática

EXCIM e SANCRIS aparecem com 2 CNPJs cada (matriz + filial). Sistema agrupou por nome normalizado em **1 registro só**, com `cnpjs_adicionais` mantendo o histórico.

### Telefones

29 de 31 fornecedores têm telefone preenchido (puxado do `/Api/v3/contatos/{id}` do Bling). 2 ficaram sem porque os CNPJs não bateram.

### Drawer de detalhes (4 abas)

1. **Dados** — cadastro + CNPJs múltiplos + categoria + natureza de operação + comercial + observações
2. **Produtos** — matéria-prima cadastrada (com estoque/status colorido) + histórico de itens comprados
3. **Histórico** — resumo financeiro (total gasto, NFes, última compra) + tabela detalhada com NF-número/preço/total
4. **Contato** — telefone + WhatsApp (botão direto) + email + site

### Filtros na lista

- Busca (nome, CNPJ, cidade)
- Categoria (multi-select)
- Ativo/Inativo/Todos

---

## 8. MATÉRIA-PRIMA

### Estado atual: **57 fabrics + 18 genéricos = 75 fabrics**

Importados das NFes de "Compra p/ Industrialização" março/abril:
- 57 itens com nome específico (PREM EL PLUS BRANCO OPTICO, GABARDINE BISTRETCH, etc)
- 18 itens genéricos criados a partir da ficha técnica (Tecido - Gabardine, Botão Comum, etc)
- Vinculados a `fornecedor_id` quando o CNPJ bate

### Histórico de compras (`purchases`)

**74 compras** importadas com preço unitário + qtd + data + NF.

Total gasto março+abril em matéria-prima: **R$ 274.812,48**

### Top 10 itens por gasto (mar+abr)

```
R$ 27.915,60   2239m   PREM EL PLUS BRANCO OPTICO
R$ 25.755,00   3030m   GABARDINE BISTRETCH BRANCO
R$ 19.222,36   1997m   BI STRET BRANCO OPTICO
R$ 18.720,31   1516m   PREM ELAST PRETO
R$ 15.350,66    254kg  Soul Light # 1014-Chumbo
R$ 14.419,17   1498m   BI STRET PRETO FT
R$ 13.949,98    231kg  Soul Light # 122-Mousse
R$ 11.645,72    193kg  Soul Light # 129-Coffee
R$ 11.603,44    192kg  Soul Light # 1065-Verde Musgo
R$ 11.043,39    150kg  Versatily Fdy (Modelador)
```

### Movements automáticos

Pra cada `purchase` foi criado um `movement` correspondente (tipo='entrada'). Total: **74 movements** populando o Histórico.

---

## 9. FICHA TÉCNICA

### Estado atual: **50 produtos · 411 itens**

Importados do Excel `ITENS/CUSTO PRODUTOS GERAL ATUALIZADO 13.08.xlsx` (50 abas, uma por modelo).

### Distribuição por tipo

| Tipo | Qtd |
|---|---|
| 🧥 Jaleco | 34 |
| 👨‍⚕️ Scrub | 4 |
| 👗 Avental | 1 |
| 🥋 Dolma | 1 |
| 🧰 Macacão | 1 |
| 🎩 Gorro | 2 |
| 📌 Acessório | 2 |
| 🏠 Home | 1 |
| 🧵 Outro | 4 |

### Top produtos por custo de produção

```
R$ 103,26  080-SCRUB LOREN     (8 itens)
R$ 102,93  090-SCRUB LORENZO   (8 itens)
R$  81,27  430-DIANA           (10 itens)
R$  81,22  610 GLAMOUR         (7 itens)
R$  80,36  355-DOLMA           (11 itens)
R$  80,19  060-SCRUB           (9 itens)
R$  79,09  522-MACACAO         (9 itens)
```

### Drill-down do produto

Ao clicar num produto, drawer mostra:

**4 KPIs no topo:**
- Custo de produção (total da ficha)
- Vendido 90d (Bling — média diária)
- Projeção 30d (próximo mês)
- Custo total mês (custo × projeção)

**Tabela completa:**
- Cada item com qtd × unidade × custo unit × custo total
- Coluna "Consumo 30d projetado"
- Coluna "Status estoque" colorida:
  - ⛔ ZERADO (vermelho)
  - ⚠️ < 14 dias (vermelho)
  - 🟡 < 30 dias (laranja)
  - ✓ OK (verde)
  - "sem vínculo" se item não tem fabric_id

**Resumo do consumo:**
"Vai produzir 42 ADAs próximo mês. Custo: R$ 1.154,16. Confira itens em vermelho."

### Card no Dashboard

Aparece automaticamente quando há vendas projetadas:

```
🔮 Projeção de Produção (próximo mês)
Custo previsto: R$ X,XXX,XX
Itens com cobertura crítica: N

⚠️ Comprar estes itens pra não faltar:
  • Item A (3.5d)
  • Item B (ZERADO)
  ...
```

---

## 10. SAÍDA POR PRODUÇÃO

Modo padrão da página "Registrar Saída" — substitui o fluxo livre antigo.

### Como funciona

1. **Toggle no topo:** `🧬 Por Produção` (default) | `📤 Saída Livre`

2. **Modo Por Produção:**
   - Dropdown com os 50 produtos da ficha (com nº de itens + custo)
   - Input de quantidade em peças
   - **Preview em tempo real** mostra:
     - Cada matéria-prima a consumir (qtd × peças)
     - Status colorido por linha (verde/laranja/vermelho)
     - Custo total da produção
   - Validação ANTES do submit:
     - Bloqueia se qualquer item tem estoque insuficiente
     - Avisa se vai ficar abaixo do mínimo

3. **Submit:**
   - Cria N movements de saída (1 por matéria-prima)
   - Atualiza `fabrics.stock` em cada um
   - Detail: `Produção: 5× JALECO 375-ADA`
   - Toast: "✓ Produção registrada"

4. **Modo Saída Livre** (legado): pra descarte/empréstimo/amostra/uso pontual.

### Ganhos vs antes

- **Auto-cálculo** de qtd (não erra)
- **Validação** antes de salvar (não permite estoque negativo)
- **Custo** rastreável de cada produção
- **Histórico** mostra "Produção: 10× ADA" em vez de "saída avulsa"
- **Cruzamento** com vendas Bling (próxima feature)

---

## 11. PÁGINAS

### Dashboard
- 6 KPIs (produtos, total estoque, baixo, sem estoque, entradas mês, "acabam em 14d")
- Card 🔮 Projeção de Produção (com alertas de cobertura)
- Strip de Vendas Bling
- Charts (status estoque, top 5, movimentações 7d)
- Últimas movimentações (12 mais recentes)

### Matéria-prima
- Filtros (busca, status: ok/baixo/crítico)
- Agrupado por categoria
- Click → edita produto

### Alertas
- KPIs (total, crítico, baixo, perdidos)
- Lista de produtos críticos
- Lista de produtos baixos
- Export PDF

### Histórico
- Filtros (produto, tipo, período)
- Tabela com data/tipo/produto/qtd/quem/detalhe
- Export PDF
- Admin pode excluir movement (se `excluir_mov`)

### Cadastrar Produto
- Form completo (nome, variação, fornecedor, unidade, mín, inicial)
- Lista produtos cadastrados
- Editar/excluir

### Registrar Entrada
- **Importação NF-e XML/PDF** (extração automática)
- Form manual

### Registrar Saída
- **Por Produção** (default — desconta ficha técnica)
- **Saída Livre** (avulsa)

### Histórico Compras
- 4 KPIs: gasto mês atual / mês anterior / variação % / total
- Charts (gasto por fornecedor, gasto últimos 6 meses)
- Alerts de variação de preço (>1%)
- Tabela detalhada com NF + preço unitário + preço anterior

### Fornecedores
- Lista com filtros (busca, categoria, ativo)
- Tabela: nome, categorias (badges), cidade/UF, contato, prazo, última compra
- Modal CRUD
- Drawer com 4 abas (Dados, Produtos, Histórico, Contato)

### Previsões Futuras (admin)
- Stats forecast
- Chart de projeção
- Tabelas com produtos críticos

### Ficha Técnica
- 4 KPIs (produtos, custo médio, vendas 90d, custo previsto mês)
- Filtros (busca, tipo, ordenação)
- Tabela: código, produto, tipo, itens, custo produção, vendas 90d, projeção 30d
- Click → Drawer drill-down

### Vendas (Bling) — Matriz
- Trend stats (30d/90d/180d)
- Charts: faturamento mensal, dia da semana
- Tabs: Top produtos / Velocidade 90d / Catálogo (2.205 produtos)

### Gerenciar Usuários (admin)
- Form criar usuário
- Stats por cargo
- Tabela de usuários com troca de cargo
- **Permissões por Cargo** (matriz editável)

### Meu Perfil
- Email, nome, cargo

---

## 12. INTEGRAÇÕES COM BLING

### Endpoints usados

| Endpoint | Uso |
|---|---|
| `/Api/v3/contatos?numeroDocumento=X` | Busca fornecedor por CNPJ |
| `/Api/v3/contatos/{id}` | Detalhe completo (telefone, endereço, email) |
| `/Api/v3/contatos/tipos` | Lista tipos (Cliente=2750249794, Fornecedor=2750249797) |
| `/Api/v3/nfe?tipo=0&dataEmissaoInicial=X&dataEmissaoFinal=Y` | NFes entrada (compras) |
| `/Api/v3/nfe/{id}` | Detalhe NF-e (itens + valores + fornecedor) |
| `/Api/v3/naturezas-operacoes` | Mapa ID → descrição (filtrar Compra/Devolução/etc) |
| `/Api/v3/produtos` + `/Api/v3/produtos/{id}` | Catálogo (com fornecedor no detalhe) |
| `/Api/v3/pedidos/compras` | Pedidos de compra (só 11 cadastrados) |

### Token

Token do Bling fica no Supabase do **DMS** (`wltmiqbhziefusnzmmkt`), tabela `bling_tokens`. Quando expira, qualquer `sync-*` edge function do DMS faz refresh automático.

### Importação

- **NF-e XML/PDF**: já implementada na UI (Registrar Entrada)
- **Notas via API Bling**: scripts Python rodados manualmente

---

## 13. TOKENS E CREDENCIAIS

### Arquivo `TOKENS SUPABASE.txt` (gitignored)

```
anon public:    eyJ... (Estoque, lvhvcxfh...)
service_role:   eyJ... (Estoque, lvhvcxfh...)
TOKEN PAT:      sbp_b77399b3... (vale pra Estoque + DMS)

OBS: PAT antigo sbp_4057fd5b... foi REVOGADO em 27/04
```

### Arquivo `TOKEN GITHUB.txt` (gitignored)
```
ghp_KZWzy...  (read+write no repo zJu4nnIA/dana-jalecos-estoque)
```

### Supabase IDs

- **Estoque (atual)**: `jkvoqqqiwtpsruwoioxl` ← URL principal
- **DMS (referência Bling)**: `wltmiqbhziefusnzmmkt`
- **Antigo (DEPRECATED, não usar)**: `lvhvcxfhdabcpvbfrooj` (do .env legacy)

### IA

- **Groq Llama 3.3** (free tier) → classificação de fornecedores, future insights
- **Gemini 2.5 Flash** (paid, no DMS) → fallback

---

## 14. SCRIPTS

Scripts Python em `C:\Users\Juan - Dana Jalecos\Documents\Sistema Marketing\.claude\scripts\` (separados do repo do Estoque pra não poluir).

### Scripts importantes

| Script | Função |
|---|---|
| `importar-fornecedores-nfe-marco.py` | Lê NFes março, filtra compras, popula fornecedores |
| `importar-nfe-abril.py` | Idem mas pra mar+abr (uso atual) |
| `puxar-fornecedores-bling.py` | Importa todos contatos tipo "Fornecedor" do Bling (282) |
| `classificar-fornecedores-ia.py` | Reclassifica categorias via Groq |
| `refinar-categorias-ia.py` | Iteração refinada |
| `importar-materia-prima.py` | Lê NFes industrialização → cria fabrics + purchases |
| `importar-ficha-tecnica.py` | Lê Excel BOM (50 abas) → ficha_produtos + ficha_tecnica |
| `criar-movements-de-purchases.py` | Cria movements correspondentes às compras |
| `atualizar-telefones-fornecedores.py` | Busca telefone+celular+email de cada fornecedor no Bling |
| `verificar-abril-novidades.py` | Compara Bling vs Estoque, identifica novos |
| `limpar-fornecedores-estoque.py` | DELETE em fornecedores (idempotência) |

### Como rodar

```bash
cd "C:/Users/Juan - Dana Jalecos/Documents/Sistema Marketing"
python ".claude/scripts/<nome>.py"
```

Variáveis de ambiente NÃO são usadas — credenciais hardcoded nos scripts (ler PAT da pasta Tecidos Projeto).

---

## 15. PENDÊNCIAS E ROADMAP

### ✅ Concluído

- [x] **Fase 1** — Fornecedores com categorias
- [x] **Fase 2** — Bling cache (vendas + produtos do DMS)
- [x] **Fase 3** — Ficha técnica (BOM)
- [x] **Fase 4 parcial** — Saída por Produção
- [x] **Brand** — Logos aplicadas
- [x] **Sidebar** — 7 grupos lógicos balanceados

### 🔴 Pendências de alto valor

1. **Custo médio ponderado** dos fabrics (atualmente todos têm o último custo unit; pra um cálculo correto, ponderar por qtd das compras)
2. **Vincular `preco_venda_estimado`** em ficha_produtos com Bling pra calcular margem
3. **Webhook Bling** — quando vende um pedido, dispara saída automática da matéria-prima (sem precisar a costureira preencher)
4. **Dashboard de produção mensal** — quantos jalecos saíram, custo total, comparação com vendido
5. **Pedido de Compra (PO)** — gerar PDF + WhatsApp pro fornecedor

### 🟡 Médio prazo

- Foto do produto (Supabase Storage)
- Código de barras + leitor mobile
- Comparador de preço entre fornecedores
- Timeline unificada (entrada → produção → venda)

### 🟢 Quando der

- Migração pro Supabase do DMS (unificar auth, cargos, notificações)
- Bot IA pra responder sobre estoque ("quanto tenho de oxford?")
- Card "Custos Estoque" no Admin

---

## 16. CICLO 27/04/2026 (TARDE) — 100% REDONDO

### 16.1 Migração de repo + GitHub Pages

- Repo migrado: `zJu4nnIA/dana-jalecos-estoque` → **`DanaJalecos/estoque`**
- GitHub Pages ligado: **https://danajalecos.github.io/estoque/**
- Repo antigo arquivado + privado (continha SERVICE_KEY exposta)
- Hash routing: `/#dashboard`, `/#alertas`, `/#estoque`, etc

### 16.2 Segurança

- **SERVICE_KEY removida do HTML** (era do projeto antigo deprecated)
- Edge Function `admin-users` valida server-side (admin via `profiles.role`)
- `.gitignore` reforçado: TOKENS/, bling-matriz/, *SECRET*, backups/
- **Pasta `bling-matriz/` removida do repo** (continha PII de 282 fornecedores + custos + faturamento)

### 16.3 Edge Functions deployadas

| Função | Trigger | Função |
|---|---|---|
| `admin-users` | Frontend admin | list / create / delete / update_role |
| `sync-bling-cache` | Cron 6h + botão manual | Copia DMS→Estoque (7 tabelas bling_*) |
| `bling-webhook` | POST do Bling | Quando pedido fica "Atendido" → desconta matéria-prima |

### 16.4 Cron pg_cron

- `sync-bling-cache-6h` — `7 */6 * * *` chama edge function via http_post + CRON_SECRET

### 16.5 Realtime configurado

Publication `supabase_realtime` inclui: `fabrics`, `movements`, `purchases`, `fornecedores`, `ficha_produtos`, `ficha_tecnica` — todas com `REPLICA IDENTITY FULL`. Canal escuta com debounce 250ms + re-render automático ao focar janela.

### 16.6 Importação Jan+Fev/2026

- 109 NFes processadas: 65 industrialização + 27 uso/consumo + 17 puladas
- 37 fornecedores novos · 103 fabrics novos · 162 purchases · 162 movements
- Total agora: 175 fabrics · 236 compras · 68 fornecedores

### 16.7 Consolidação de duplicados

- `Broche Magnetico Personalizado` (3x) → 1 (stock 121+11+117 = 249)
- `BI STRET BLUE UNI FT` → mergiu com `BI STRET BLUE UNI` (stock 239+309 = 548)
- `ETIQ:DANA JALECOS MANEQ:G` → `ETIQ DANA JALECOS MANEQ - G` (renomeado limpo)

### 16.8 Min stock = 10 em todos

Aplicado em massa em todos os 175 fabrics. Resultado:
- Estoque OK: 114
- Estoque Baixo (1-9): 43
- Sem Estoque (=0): 18

### 16.9 Custo médio ponderado

View `fabric_custo_medio` agrega purchases por `fabric_id`:
- `custo_medio_ponderado = SUM(total_price) / SUM(qty)`
- `valor_em_estoque = cmp × stock`

Dashboard "💰 Valor em Estoque" agora usa cmp em vez de "último preço" — mais preciso.

### 16.10 Webhook Bling configurado

URL cadastrada no Bling Matriz:
```
https://jkvoqqqiwtpsruwoioxl.supabase.co/functions/v1/bling-webhook?secret=<WEBHOOK_SECRET>
```
Card ativado: **Pedidos de Vendas** (Criação + Atualização + Exclusão). Quando pedido fica `situacao=9 (Atendido)`, edge function desconta matéria-prima da ficha técnica automaticamente.

### 16.11 Card de Alertas com WhatsApp

Cada item em alerta na página `/#alertas` tem botão verde **"📱 Comprar (X un)"** que:
- Calcula qty sugerida (max(2×min - stock, 45d consumo, min_stock))
- Abre WhatsApp Web pré-formatado pro fornecedor vinculado
- Helper `fabricFornecedor(f)` lookup com fallback no último purchase

### 16.12 Pedido de Compra (PO)

Botão "📄 Pedido de Compra" no topbar de Alertas:
- Agrupa todos os items em alerta por fornecedor
- Por fornecedor: PDF formal (jsPDF + autotable) + botão WhatsApp
- PDF tem cabeçalho, CNPJ, total estimado, número PO, data

### 16.13 Dashboard Produção mensal

Card no Dashboard parsing de movements detail (`Produção: Nx CODIGO` e `Bling: 1× CODIGO`):
- Total peças produzidas no mês
- Custo de matéria-prima (via custo médio)
- Custo médio por peça
- Variação % vs mês anterior
- Top 5 produtos do mês

### 16.14 Comparador de preços

View `comparador_precos` agrega purchases por `fabric_id + fornecedor_id`. Modal "⚖️ Comparar Preços" no topbar de Histórico de Compras:
- Lista produtos comprados de 2+ fornecedores
- Marca o melhor preço com 🏆 + economia %
- Hoje só CR:40 e CR:60 têm múltiplos fornecedores; vai crescer com o tempo

### 16.15 Import NF-e XML melhorado

- `normFornName(s)` ignora acentos + sufixos LTDA/EIRELI/SA pra match
- Match em `cnpjs_adicionais` (filiais consolidadas)
- Auto-adiciona CNPJ alternativo se nome bater mas CNPJ for diferente
- `normFabricName(s)` ignora sufixos triviais FT/UN/SOFT/STR pra evitar duplicado

### 16.16 Backup semanal

- Script `scripts/backup/backup-supabase.py` (env-driven)
- Workflow `.github/workflows/backup-supabase.yml` (criado local; precisa adicionar via UI GitHub porque PAT não tem scope `workflow`)
- Secrets `SUPABASE_PAT` + `PROJECT_REF` já configurados no repo via API
- Roda Domingo 00:17 BRT, mantém últimos 12 backups

### 16.17 Estado atual dos dados (27/04/2026)

| Tabela | Rows |
|---|---|
| fabrics | 175 |
| purchases | 236 (R$ 478.192,89 total) |
| movements | 236 |
| fornecedores | 68 |
| ficha_produtos | 50 |
| ficha_tecnica | 411 itens |
| bling_produtos | 2.205 |
| bling_velocidade_90d | 100 |

### 16.18 Pendências do user

1. ⏳ Adicionar `.github/workflows/backup-supabase.yml` via UI GitHub
2. ⏳ Apagar de fato o repo antigo `zJu4nnIA/dana-jalecos-estoque` (atualmente arquivado privado)
3. ⏳ Cadastrar fornecedor pros 18 fabrics que ainda têm stock=0 (manual quando comprar)
4. ⏳ Limpar histórico do git (commit antigo ainda tem `bling-matriz/` PII — só `git filter-repo` removeria de fato)

### 16.19 Tokens/secrets em uso

| Secret | Local | Uso |
|---|---|---|
| `SB_SERVICE_KEY` | env Edge Functions | Auto-injetado Supabase |
| `DMS_URL` | env Edge Functions | URL do projeto DMS pra sync |
| `DMS_SERVICE_KEY` | env Edge Functions | Service role do DMS |
| `CRON_SECRET` | env Edge Functions + cron job | Auth do cron pra `sync-bling-cache` |
| `WEBHOOK_SECRET` | env Edge Function + Bling | Auth dos webhooks |
| `SUPABASE_PAT` | GitHub repo secrets | Backup workflow |
| `PROJECT_REF` | GitHub repo secrets | Backup workflow |
| `ghp_tBKNahody...` | local + remote git | Push pro `DanaJalecos/estoque` |

Todos secrets locais ficam em `TOKENS/` (gitignored).

---

## CONTATOS DESTE PROJETO

- **Owner / dev:** Juan
- **Stakeholder:** Dana (dona)
- **Stakeholder operacional:** Manuela (Manu — marketing, integra com DMS)

---

## 17. CICLO 27/04/2026 (NOITE) — BOT IA + UX PROFISSIONAL + AUDITORIAS

### 17.1 Bot IA do Estoque (`estoque-ai-chat`)

**Edge Function deployed `ACTIVE`** com function-calling Groq + fallback Gemini.

**3 providers em cascata** (com retry exponential backoff 1s→2s pra 429/503/502):
| Ordem | Provider | Modelo |
|---|---|---|
| 1 | Groq (primário) | `llama-3.3-70b-versatile` (free) |
| 2 | Gemini (fallback) | `gemini-2.5-flash` (OpenAI-compatible endpoint) |
| 3 | Groq fallback final | `llama-3.1-8b-instant` (modelo menor, quota maior) |

**10 tools (function calling):**
- `consultar_estoque(query)` — busca matéria-prima por nome/cor/categoria
- `consultar_alertas()` — produtos sem estoque ou abaixo do mínimo
- `consultar_fornecedor(query)` — info de fornecedor por nome
- `fornecedor_de_produto(produto_query)` — qual fornecedor vende X
- `consultar_compras_recentes(query?, limit?)` — histórico de compras
- `consultar_ficha_tecnica(produto_query)` — BOM dos jalecos
- `estatisticas_gerais()` — visão global (total/sem estoque/baixo/gasto)
- `projecao_consumo(dias=14)` — produtos vão acabar em N dias
- `ranking_fornecedores(ordenar_por, limit, periodo_dias)` — top fornecedores por gasto/num/última compra
- `ranking_produtos(ordenar_por, limit)` — top fabrics por valor/qtd/estoque

**UI:** botão flutuante `💬` canto inferior direito (só pós-login). Chat panel com markdown leve. Atalhos: Alertas / Projeção / Visão geral.

**Robustez:**
- Retry com backoff em 429/503 (1s, 2s)
- Mensagem amigável ao user em fail total ("alta demanda", "limite atingido", etc)
- `User-Agent: Mozilla/5.0 EstoqueBot/1.0` pra bypass Cloudflare 1010 do Groq

**Auth:** `verify_jwt: true` — qualquer cargo logado pode usar. Keys nunca expostas no frontend.

**Secrets configurados no Supabase Estoque:**
- `GROQ_API_KEY` = `gsk_HnzgBMG...`
- `GEMINI_API_KEY` = `AIzaSyDb61OCa...`

### 17.2 Sidebar profissional — emojis → SVG icons

**Antes:** 14 botões com emojis decorativos coloridos (📊, ⚠️, 🧵, 📜...).
**Depois:** SVG icons stroke (Lucide-style) inline, monocromáticos, herdam cor do texto. Opacity 0.6 → 0.9 hover → 1.0 ativo.

**CSS atualizado:**
```css
.sidebar-nav button .icon { width:18px;height:18px;flex-shrink:0;opacity:.6; }
.sidebar-nav button .icon svg { stroke:currentColor;fill:none;stroke-width:1.6; }
```

**Limpeza paralela:**
- Topbars: "📥 Registrar Entrada" → "Registrar Entrada"
- KPIs: "💰 Valor em Estoque" → "Valor em Estoque"
- Card Dashboard: "🏭 Produção do Mês" → "Produção do Mês"
- Tabs Bling: "🏆 Top produtos" → "Top produtos"

**O que MANTIVE** (semântico, não decorativo):
- ⚠️ em mensagens de aviso reais (estoque baixo, falta material)
- ⛔ ZERADO em status crítico
- ✓ OK feedback positivo
- 📱 verde no botão WhatsApp
- 💬 ícone do bot IA flutuante

### 17.3 Histórico de Compras — Bug "Sem fornecedor"

**Reportado pela Manu:** chart "Gasto por Fornecedor" mostrava 100% como "Sem fornecedor" mesmo tendo 31 fornecedores cadastrados.

**Causa:** as 74 purchases têm `fornecedor_id` preenchido (FK), mas o JS lia o campo legado `p.supplier` (string text, vazio em 100% dos imports).

**Fix:**
```js
function getSupplierName(p) {
  if (p.fornecedor_id) {
    const f = fornecedores.find(x => x.id === p.fornecedor_id);
    if (f) return f.nome;
  }
  return p.supplier || '';
}
```

Aplicado em **4 lugares**: chart doughnut, alertas de variação de preço, tabela do histórico, export PDF.

**Bonus:** chart agrupa fornecedores com fatia <3% em "Outros" + tooltip detalhado mostra os primeiros 8 que estão dentro da fatia.

### 17.4 Auto-update do Dashboard

**Reportado pela Manu:** dashboard só atualizava no F5.

**Causa raiz:** publicação `supabase_realtime` no Postgres estava VAZIA. Realtime subscriptions no JS não disparavam nada.

**Fix SQL:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.fabrics, public.movements, public.purchases,
  public.fornecedores, public.ficha_produtos, public.ficha_tecnica;

ALTER TABLE public.fabrics REPLICA IDENTITY FULL; -- pra DELETE com payload
-- (mesma coisa nas outras 5)
```

**JS estendido:** canal escuta as 6 tabelas com debounce 250ms + re-render no foco da janela. `renderCurrent()` agora cobre todas as páginas (compras, ficha, alertas, previsões, usuarios) — antes só 6.

### 17.5 KPIs do Dashboard — Bug "Entradas: 0"

**Reportado pela Manu:** dashboard mostrava "Entradas este Mês: 0" mas tinha 74 entradas registradas.

**Causa:** filtro era `m.date >= "2026-04"` — as 74 entradas têm `date=2026-03-XX` (datas reais das NFes de março).

**Fix em duas etapas:**
1. Trocou pra rolling 30 dias (não mês corrente)
2. Trocou de `m.date` pra `m.created_at` — porque o usuário está perguntando "atividade RECENTE no sistema", não "data da NF"

**Outro bug do KPI "Total em Estoque: 20867.2":**
- Somava metros + unidades + kg + horas tudo junto (sem sentido)
- Trocou pra **"💰 Valor em Estoque (R$)"** = `Σ stock × custo médio ponderado`

### 17.6 Custo Médio Ponderado — view `fabric_custo_medio`

**Antes:** sistema usava "último preço pago" pra valor em estoque (impreciso).

**Agora:** view SQL agrega purchases por fabric_id:
```sql
custo_medio_ponderado = SUM(total_price) / SUM(qty)
valor_em_estoque = cmp × stock
```

Frontend usa essa view automaticamente na `loadAll()` + helper `getCustoMedio(fabricId)`.

### 17.7 Card de Alertas com botão **WhatsApp**

Cada item em alerta na página `/#alertas` tem botão verde:
```
📱 Comprar (45 metros)
```

Click → abre WhatsApp Web com mensagem pré-formatada pro fornecedor vinculado:
```
Olá, [contato]! Tudo bem?
Preciso fazer um pedido:
📦 *GABARDINE BISTRETCH BRANCO*
Quantidade: *45 metros* ≈ R$ 382,50
Pode confirmar disponibilidade, prazo, valor unit, forma de pagamento?
```

**Helper `suggestQty(f)`:** sugere reposição = `max(2×min - stock, consumo30d × 1.5, min_stock)`.

**Helper `fabricFornecedor(f)`:** lookup com fallback no último purchase com `fornecedor_id`.

### 17.8 Pedido de Compra (PO) — PDF + WhatsApp por fornecedor

Botão **"Pedido de Compra"** no topbar de Alertas:
- Modal agrupa items em alerta por fornecedor
- Por fornecedor:
  - **PDF** formal (jsPDF + autotable): cabeçalho, CNPJ, items, total estimado, data, número PO
  - **WhatsApp** com lista completa pro fornecedor

Tudo via `window.jspdf` + `autoTable`.

### 17.9 Dashboard de Produção mensal

Card no Dashboard que parseia `movements.detail` no formato `"Produção: Nx CODIGO"` e `"Bling: 1× CODIGO (NF #...)"`:
- Total peças produzidas no mês
- Custo de matéria-prima (via custo médio ponderado)
- Custo médio por peça
- Variação % vs mês anterior
- Top 5 produtos do mês (chips)

### 17.10 Comparador de preços — view `comparador_precos`

```sql
CREATE VIEW comparador_precos AS
SELECT f.id AS fabric_id, f.name AS produto, f.unit,
       fo.id AS fornecedor_id, fo.nome AS fornecedor_nome,
       COUNT(p.id) AS num_compras,
       MIN/MAX/AVG(p.unit_price), ...
FROM fabrics f JOIN purchases p ON p.fabric_id=f.id
JOIN fornecedores fo ON fo.id=p.fornecedor_id
GROUP BY f.id, fo.id;
```

Botão **"⚖️ Comparar Preços"** no topbar Histórico de Compras → modal lista produtos comprados de 2+ fornecedores. Marca melhor preço com 🏆 + economia %.

### 17.11 Import NF-e XML melhorado (fuzzy match)

**Antes:** matching exato por nome/CNPJ. Criava duplicados quando NF tinha pequena variação.

**Agora:**
- `normFornName(s)` ignora acentos, sufixos LTDA/EIRELI/SA/ME/EPP
- Match em `cnpjs_adicionais` (filiais consolidadas)
- Auto-adiciona CNPJ alternativo se nome bater mas CNPJ for diferente
- `normFabricName(s)` ignora sufixos triviais FT/UN/SOFT/STR

### 17.12 Importações Jan+Fev/2026 NFes (script)

`importar-nfe-jan-fev-2026.py` rodado:
- 109 NFes processadas (mar+abr/jan+fev consolidado)
- 65 industrialização + 27 uso/consumo + 17 puladas
- +37 fornecedores · +103 fabrics · +162 purchases · +162 movements

**Estado atual: R$ 478.192,89 em 236 compras · 175 fabrics · 68 fornecedores**

### 17.13 Consolidação de duplicados

Script `consolidar-fabrics-duplicados.py`:
- **Broche Magnético Personalizado** (3x → 1, stock 121+11+117 = 249)
- **BI STRET BLUE UNI FT** → mergiu com **BI STRET BLUE UNI** (stock 239+309 = 548m)
- **ETIQ:DANA JALECOS MANEQ:G** renomeado pra `ETIQ DANA JALECOS MANEQ - G` (formato limpo, mantidas separadas G/M/P/PP)

Reapontou todas as referências (purchases, movements, ficha_tecnica) antes de deletar duplicados → **nenhum dado perdido**.

### 17.14 Min stock = 10 em todos os 175 fabrics

Bulk UPDATE pelo Manu pediu. Resultado:
- ✅ OK (>10): 114
- 🟡 Baixo (1-9): 43
- 🔴 Sem estoque (=0): 18

Os 18 zerados são genéricos da ficha técnica (Botão Comum, Tag, Cadarço, etc) sem compra registrada.

### 17.15 Limpeza de segurança/governança

**bling-matriz/ removido do repo:**
- Continha PII de 282 fornecedores (CNPJ/telefone/celular)
- Preço de custo de 2.205 produtos (dado financeiro estratégico)
- Faturamento mensal exposto
- Movido pra `_dados_locais/` (fora do repo) + `bling-matriz/` no .gitignore

**.gitignore reforçado:**
```
*TOKEN*.txt, *AI_KEYS*, TOKENS/, .claude/,
bling-matriz/, *.gz, .env, .env.*, etc
```

**Repo antigo `zJu4nnIA/dana-jalecos-estoque`:**
- Arquivado + tornado privado (continha SERVICE_KEY antigo exposto)
- Pra deletar de fato, Juan precisa fazer manual via UI GitHub

⚠️ Histórico do git ainda tem `bling-matriz/` (commit antigo). Pra remoção total precisa `git filter-repo` (operação destrutiva).

### 17.16 Auditoria final do Dashboard

Validação contra banco:
| KPI | Mostra | Real | Status |
|---|---|---|---|
| Produtos | 175 | 175 | ✅ |
| Valor em Estoque | R$ XXX | sum(stock×cmp) | ✅ |
| Estoque Baixo | 43 | 43 | ✅ |
| Sem Estoque | 18 | 18 | ✅ |
| Entradas (30 dias) | 236 | 236 | ✅ (created_at) |

### 17.17 Fluxo completo "100% redondo" da operação

1. **Compra** chega via NF-e do Bling → import XML auto-cria fornecedor + fabric + purchase + movement
2. **Stock** sobe automaticamente (movement type=entrada)
3. **Cron 6h** sincroniza dados Bling → projeção de consumo atualiza
4. **Webhook Bling** dispara quando pedido fica "Atendido" → ficha técnica é consumida → matéria-prima é descontada automaticamente
5. **Alerta** dispara quando stock < min_stock → Manu vê na página Alertas
6. **Click "Comprar"** → WhatsApp pré-formatado pro fornecedor
7. **Bot IA** responde dúvidas em linguagem natural ("o que tá acabando?", "qual fornecedor de zíper?", "top 5 fornecedores")
8. **Dashboard** atualiza em realtime entre todos os usuários

### 17.18 Estado dos dados (27/04/2026 noite)

| Tabela | Rows |
|---|---|
| fabrics | 175 |
| fornecedores | 68 |
| purchases | 236 (R$ 478.192,89) |
| movements | 236 (todas entradas — saídas começarão via webhook quando vender) |
| ficha_produtos | 50 |
| ficha_tecnica | 411 itens |
| bling_produtos | 2.205 |
| bling_velocidade_90d | 100 |

### 17.19 Pendências do Juan

1. ⏳ Adicionar `.github/workflows/backup-supabase.yml` via UI GitHub (PAT sem `workflow` scope)
2. ⏳ Apagar de fato repo antigo `zJu4nnIA/dana-jalecos-estoque` (atualmente arquivado privado)
3. ⏳ 18 fabrics sem stock — cadastrar manualmente quando Manu/Dana for comprar
4. ⏳ Limpar histórico do git do bling-matriz/ (opcional, requer git filter-repo)

### 17.20 Edge Functions deployadas (resumo)

| Função | Trigger | Status |
|---|---|---|
| `admin-users` | Frontend admin | ACTIVE v1 |
| `sync-bling-cache` | Cron 6h + botão manual | ACTIVE v3 |
| `bling-webhook` | POST do Bling em pedido atendido | ACTIVE v1 |
| `estoque-ai-chat` | Frontend bot 💬 | ACTIVE v7 |

### 17.21 Secrets em uso (Supabase Estoque)

| Secret | Valor (preview) | Uso |
|---|---|---|
| `SB_SERVICE_KEY` (auto) | — | Operações admin internas |
| `DMS_URL` | wltmiqbhziefusnzmmkt | URL do projeto DMS pra sync |
| `DMS_SERVICE_KEY` | eyJhbGc... | Service role do DMS |
| `CRON_SECRET` | _G_BxVPOgTz7... | Auth do cron pra sync-bling-cache |
| `WEBHOOK_SECRET` | XU9zcG-KTRUW... | Auth dos webhooks Bling |
| `GROQ_API_KEY` | gsk_HnzgBMG... | Bot IA primário |
| `GEMINI_API_KEY` | AIzaSyDb61... | Bot IA fallback |

---

**Fim · v2.0 · 27/04/2026 noite — ciclo 17 (Bot IA + UX profissional + auditorias completas)**
