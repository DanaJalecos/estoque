-- ============================================
-- DANA JALECOS — V7: Cache de dados do Bling (Matriz)
-- Fonte: snapshot em bling-matriz/ (DMS wltmiqbhziefusnzmmkt)
-- Idempotente
-- ============================================

-- 7.1) Catalogo de produtos do Bling
CREATE TABLE IF NOT EXISTS bling_produtos (
  id BIGINT PRIMARY KEY,          -- id do Bling
  nome TEXT NOT NULL,
  codigo TEXT,                    -- SKU (pode ser null)
  preco NUMERIC,
  preco_custo NUMERIC,
  estoque_virtual NUMERIC,
  tipo TEXT,                      -- P/S etc
  situacao TEXT,                  -- A=ativo
  formato TEXT,                   -- V=variacao, S=simples
  imagem_url TEXT,
  bling_created_at TIMESTAMPTZ,
  empresa TEXT DEFAULT 'matriz',
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bling_prod_nome ON bling_produtos USING GIN (to_tsvector('portuguese', nome));
CREATE INDEX IF NOT EXISTS idx_bling_prod_codigo ON bling_produtos(codigo) WHERE codigo IS NOT NULL;

-- 7.2) Top produtos (agregado 12m, chave = nome)
CREATE TABLE IF NOT EXISTS bling_top_produtos (
  produto TEXT PRIMARY KEY,
  total_pedidos INT NOT NULL DEFAULT 0,
  total_quantidade NUMERIC NOT NULL DEFAULT 0,
  total_receita NUMERIC NOT NULL DEFAULT 0,
  preco_medio NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7.3) Serie temporal: produto x mes
CREATE TABLE IF NOT EXISTS bling_produto_mes (
  produto TEXT NOT NULL,
  ano INT NOT NULL,
  mes INT NOT NULL,
  total_pedidos INT NOT NULL DEFAULT 0,
  total_quantidade NUMERIC NOT NULL DEFAULT 0,
  total_receita NUMERIC NOT NULL DEFAULT 0,
  preco_medio NUMERIC,
  PRIMARY KEY (produto, ano, mes)
);
CREATE INDEX IF NOT EXISTS idx_bling_pm_ano_mes ON bling_produto_mes(ano, mes);

-- 7.4) Trend macro mensal (1 linha por mes)
CREATE TABLE IF NOT EXISTS bling_vendas_mes (
  mes DATE PRIMARY KEY,
  qtd_pedidos INT NOT NULL DEFAULT 0,
  faturamento_produtos NUMERIC NOT NULL DEFAULT 0,
  ticket_medio NUMERIC
);

-- 7.5) Velocidade 90d (top 100 + metricas)
CREATE TABLE IF NOT EXISTS bling_velocidade_90d (
  produto TEXT PRIMARY KEY,
  qtd_90d NUMERIC NOT NULL DEFAULT 0,
  media_diaria_90d NUMERIC NOT NULL DEFAULT 0,
  projecao_mensal NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7.6) Trend 30/90/180 dias
CREATE TABLE IF NOT EXISTS bling_trend_periodo (
  periodo TEXT PRIMARY KEY,       -- '30d', '90d', '180d'
  pedidos INT NOT NULL DEFAULT 0,
  faturamento NUMERIC NOT NULL DEFAULT 0,
  pedidos_por_dia NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7.7) Vendas por dia da semana
CREATE TABLE IF NOT EXISTS bling_vendas_dia_semana (
  dia_semana INT PRIMARY KEY,     -- 0=domingo ... 6=sabado (ajustar no import)
  nome_dia TEXT,
  qtd_pedidos INT NOT NULL DEFAULT 0,
  faturamento NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7.8) Meta / timestamp do ultimo sync
CREATE TABLE IF NOT EXISTS bling_sync_meta (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sync_at TIMESTAMPTZ,
  source TEXT,                    -- 'snapshot' | 'dms_live'
  total_produtos INT,
  total_top_produtos INT,
  total_produto_mes INT,
  notes TEXT
);
INSERT INTO bling_sync_meta (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 7.9) RLS — todos autenticados LEEM; so admin/gerente ESCREVE (sync manual)
ALTER TABLE bling_produtos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_top_produtos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_produto_mes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_vendas_mes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_velocidade_90d     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_trend_periodo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_vendas_dia_semana  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bling_sync_meta          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'bling_produtos','bling_top_produtos','bling_produto_mes',
    'bling_vendas_mes','bling_velocidade_90d','bling_trend_periodo',
    'bling_vendas_dia_semana','bling_sync_meta'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Autenticados leem %I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Autenticados leem %I" ON %I FOR SELECT USING (auth.uid() IS NOT NULL)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin/gerente escrevem %I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Admin/gerente escrevem %I" ON %I FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'',''gerente'')))', t, t);
  END LOOP;
END $$;

-- 7.10) Adicionar permissao 'bling' na matriz de roles
UPDATE role_permissions
SET permissions = permissions || jsonb_build_object(
  'gerente',    (COALESCE(permissions->'gerente','{}'::jsonb)    || '{"bling":true}'::jsonb),
  'estoquista', (COALESCE(permissions->'estoquista','{}'::jsonb) || '{"bling":true}'::jsonb),
  'costureira', (COALESCE(permissions->'costureira','{}'::jsonb) || '{"bling":false}'::jsonb)
),
updated_at = now()
WHERE id = 1;
