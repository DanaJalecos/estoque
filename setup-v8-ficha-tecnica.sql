-- ════════════════════════════════════════════════════════════════════
-- DANA JALECOS — V8: Ficha Técnica (BOM — Bill of Materials)
-- 1 produto = N matérias-primas com quantidade + custo
-- Cruza com vendas Bling pra projetar consumo
-- Idempotente
-- ════════════════════════════════════════════════════════════════════

-- 8.1) Header dos produtos (jalecos/scrubs/aventais/etc)
CREATE TABLE IF NOT EXISTS ficha_produtos (
  codigo TEXT PRIMARY KEY,                 -- '375-ADA', '080-SCRUB LOREN'
  nome TEXT NOT NULL,                       -- 'JALECO 375-ADA'
  tipo TEXT,                                 -- 'Jaleco' | 'Scrub' | 'Avental' | 'Gorro' | 'Outro'
  bling_codigo_pattern TEXT,                -- regex pra cruzar com bling_top_produtos.produto
  custo_total NUMERIC NOT NULL DEFAULT 0,   -- cache: SUM(ficha_tecnica.custo_total)
  preco_venda_estimado NUMERIC,             -- pra calcular margem (do Bling)
  total_itens INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ficha_prod_tipo ON ficha_produtos(tipo);
CREATE INDEX IF NOT EXISTS idx_ficha_prod_ativo ON ficha_produtos(ativo) WHERE ativo = true;

-- 8.2) Itens (matéria-prima necessária pra fazer 1 unidade)
CREATE TABLE IF NOT EXISTS ficha_tecnica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_codigo TEXT NOT NULL REFERENCES ficha_produtos(codigo) ON DELETE CASCADE,
  ordem INT NOT NULL DEFAULT 0,
  item_descricao TEXT NOT NULL,             -- 'Tecido - Gabardine' (do Excel original)
  fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL,  -- vínculo com matéria-prima real (NULL se não bater)
  quantidade NUMERIC NOT NULL,
  unidade TEXT NOT NULL,                    -- 'Metro', 'Unidade', 'Jogo', 'kg'
  custo_unitario NUMERIC NOT NULL,
  custo_total NUMERIC GENERATED ALWAYS AS (quantidade * custo_unitario) STORED,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(produto_codigo, item_descricao)
);

CREATE INDEX IF NOT EXISTS idx_ft_produto ON ficha_tecnica(produto_codigo);
CREATE INDEX IF NOT EXISTS idx_ft_fabric ON ficha_tecnica(fabric_id);

-- 8.3) Função: recalcular custo total do produto (chamada após insert/update na ficha)
CREATE OR REPLACE FUNCTION ficha_recalcular_custo(p_codigo TEXT)
RETURNS NUMERIC AS $$
DECLARE
  total NUMERIC;
  qtd_itens INT;
BEGIN
  SELECT COALESCE(SUM(custo_total), 0), COUNT(*)
  INTO total, qtd_itens
  FROM ficha_tecnica WHERE produto_codigo = p_codigo;

  UPDATE ficha_produtos
  SET custo_total = total, total_itens = qtd_itens, updated_at = now()
  WHERE codigo = p_codigo;

  RETURN total;
END;
$$ LANGUAGE plpgsql;

-- 8.4) Trigger pra recalcular automaticamente
CREATE OR REPLACE FUNCTION trg_ficha_recalcular()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM ficha_recalcular_custo(COALESCE(NEW.produto_codigo, OLD.produto_codigo));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ficha_tec_aiu ON ficha_tecnica;
CREATE TRIGGER trg_ficha_tec_aiu
AFTER INSERT OR UPDATE OR DELETE ON ficha_tecnica
FOR EACH ROW EXECUTE FUNCTION trg_ficha_recalcular();

-- 8.5) View: vendas por código de produto (extrai padrão "375-ADA" do nome Bling)
CREATE OR REPLACE VIEW vendas_por_codigo_ficha AS
SELECT
  fp.codigo,
  fp.nome,
  COALESCE(SUM(btp.qtd_90d), 0) AS qtd_vendida_90d,
  COALESCE(SUM(btp.qtd_90d) / 90.0, 0) AS media_diaria,
  COALESCE(SUM(btp.qtd_90d) / 90.0 * 30, 0) AS projecao_mensal,
  COALESCE(AVG(NULLIF(btp.qtd_90d, 0) * 0 + btp.media_diaria_90d), 0) AS preco_medio_venda
FROM ficha_produtos fp
LEFT JOIN bling_velocidade_90d btp
       ON btp.produto ILIKE '%' || fp.codigo || '%'
       OR btp.produto ILIKE '%' || REPLACE(fp.codigo, '-', ' ') || '%'
GROUP BY fp.codigo, fp.nome;

-- 8.6) View principal: consumo projetado por matéria-prima
CREATE OR REPLACE VIEW consumo_projetado AS
SELECT
  ft.fabric_id,
  f.name AS fabric_name,
  f.color AS fabric_variacao,
  f.unit AS fabric_unidade,
  f.stock AS estoque_atual,
  f.min_stock AS estoque_minimo,
  COUNT(DISTINCT ft.produto_codigo) AS produtos_que_usam,
  SUM(ft.quantidade * vpc.projecao_mensal) AS consumo_30d_projetado,
  CASE
    WHEN SUM(ft.quantidade * vpc.projecao_mensal) > 0
    THEN ROUND((f.stock / NULLIF(SUM(ft.quantidade * vpc.projecao_mensal) / 30.0, 0))::numeric, 1)
    ELSE NULL
  END AS dias_de_cobertura
FROM ficha_tecnica ft
LEFT JOIN fabrics f ON f.id = ft.fabric_id
LEFT JOIN vendas_por_codigo_ficha vpc ON vpc.codigo = ft.produto_codigo
WHERE ft.fabric_id IS NOT NULL
GROUP BY ft.fabric_id, f.name, f.color, f.unit, f.stock, f.min_stock;

-- 8.7) RLS
ALTER TABLE ficha_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_tecnica  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem ficha_produtos" ON ficha_produtos;
CREATE POLICY "Autenticados leem ficha_produtos" ON ficha_produtos FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin/gerente CUD ficha_produtos" ON ficha_produtos;
CREATE POLICY "Admin/gerente CUD ficha_produtos" ON ficha_produtos FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerente'))
);

DROP POLICY IF EXISTS "Autenticados leem ficha_tecnica" ON ficha_tecnica;
CREATE POLICY "Autenticados leem ficha_tecnica" ON ficha_tecnica FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin/gerente CUD ficha_tecnica" ON ficha_tecnica;
CREATE POLICY "Admin/gerente CUD ficha_tecnica" ON ficha_tecnica FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerente'))
);

-- 8.8) Permissão "ficha" na matriz de roles
UPDATE role_permissions
SET permissions = permissions || jsonb_build_object(
  'gerente',    (COALESCE(permissions->'gerente','{}'::jsonb)    || '{"ficha":true,"ficha_editar":true}'::jsonb),
  'estoquista', (COALESCE(permissions->'estoquista','{}'::jsonb) || '{"ficha":true,"ficha_editar":false}'::jsonb),
  'costureira', (COALESCE(permissions->'costureira','{}'::jsonb) || '{"ficha":true,"ficha_editar":false}'::jsonb)
),
updated_at = now()
WHERE id = 1;
