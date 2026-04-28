# Sistema de Estoque · Dana Jalecos

Sistema interno de **controle de estoque, produção e fornecedores** integrado com o Bling (ERP).

## Stack

- **Frontend**: SPA estática single-file (`index.html`, ~3.500 linhas, HTML+JS+CSS inline)
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions Deno + Realtime)
- **ERP integrado**: Bling v3 (NFe, contatos, estoque, vendas)
- **IA**: Groq Llama 3.3 70B (chat estoque) + Gemini 2.5 Flash (fallback)
- **Deploy**: Vercel (este repo)

## Estrutura

```
.
├── index.html                       # App principal (SPA)
├── proposta.html                    # Pagina institucional estatica
├── assets/                          # Logos da marca
├── DOCUMENTACAO-COMPLETA-ESTOQUE.md # Doc completa do sistema (3500+ linhas)
├── ROADMAP-ESTOQUE-DANA.md          # Roadmap original (~80% cumprido)
├── setup-v2.sql ... v8.sql          # Migrações SQL (auth → ficha técnica)
├── supabase/functions/              # Source TS de 4 edge functions
│   ├── admin-users/                 # CRUD usuários
│   ├── bling-webhook/               # Webhook pedidos Bling (saída produção auto)
│   ├── estoque-ai-chat/             # Bot IA do estoque
│   └── sync-bling-cache/            # Cron 6h sincroniza vendas Bling
├── scripts/backup/                  # Backup workflow (Supabase Management API)
└── .github/workflows/main.yml       # GitHub Action: backup semanal Supabase
```

## Funcionalidades

| Função | Detalhe |
|---|---|
| Cadastro de matéria-prima | tecidos, aviamentos, embalagens, etiquetas, linhas, etc |
| Movimentação | entradas (compras) e saídas (consumo na produção) |
| Fornecedores | importados do Bling com CNPJ, endereço, telefone, categoria |
| Compras | histórico de NFes com preço, comparação mês-a-mês |
| Ficha técnica | 50 produtos com BOM (matéria-prima necessária por unidade) |
| Saída por produção | escolhe produto + qtd → desconta automaticamente toda matéria-prima |
| Cruzamento Bling | vendas dos últimos 90 dias por SKU pra projetar consumo |
| Alertas | itens em cobertura crítica, estoque baixo, etc |
| Importação NF-e | XML/PDF com extração automática de itens |
| Bot IA | responde dúvidas sobre estoque em linguagem natural |

## Deploy local

Site estático puro — qualquer servidor HTTP serve:

```bash
python -m http.server 8080
# abrir http://localhost:8080
```

## Deploy Vercel

Conectar o repo ao Vercel → deploy automático em qualquer push pra `main`. Config já no `vercel.json` (sem build, headers de segurança, cache em assets).

## Backup automático

Workflow `.github/workflows/main.yml` roda toda Domingo às 00:07 BRT. Faz dump do schema + dados + RLS policies do Supabase via Management API, comprime, e commita em `backups/YYYY-MM-DD/`. Mantém últimos 12 backups.

Secrets necessários no GitHub repo: `SUPABASE_PAT` + `PROJECT_REF` (já configurados).

## Documentação completa

[`DOCUMENTACAO-COMPLETA-ESTOQUE.md`](./DOCUMENTACAO-COMPLETA-ESTOQUE.md) cobre arquitetura, schema, edge functions, integração Bling, fluxos de IA, permissões e histórico de mudanças por ciclo.

## Sistema irmão

DMS (Dana Marketing System) — sistema separado pra gestão de marketing/vendas/CRM:
https://github.com/DanaJalecos/dana-marketing
