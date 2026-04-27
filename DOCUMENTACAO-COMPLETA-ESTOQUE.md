# DOCUMENTAÇÃO COMPLETA — Sistema de Estoque Dana Jalecos

> **Última atualização:** 27/04/2026
> **Repo GitHub:** https://github.com/zJu4nnIA/dana-jalecos-estoque
> **Localização local:** `C:\Users\Juan - Dana Jalecos\Documents\Sistema Marketing\. Outro sistema\Tecidos Projeto\`
> **Supabase:** `jkvoqqqiwtpsruwoioxl` ("Sistema Controle de Estoque/Compras")
> **Stack:** Single-page HTML + Supabase (Auth + Postgres + Realtime + Storage) + IA (Groq Llama 3.3)

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

## CONTATOS DESTE PROJETO

- **Owner / dev:** Juan
- **Stakeholder:** Dana (dona)
- **Stakeholder operacional:** Manuela (Manu — marketing, integra com DMS)

---

**Fim · v1.0 · 27/04/2026**
