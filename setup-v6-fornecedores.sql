-- ============================================
-- DANA JALECOS — V6: Fornecedores com Categorias
-- Cole no SQL Editor do Supabase e clique RUN
-- (Idempotente — pode rodar multiplas vezes sem quebrar)
-- ============================================

-- 6.1) Tabela de fornecedores
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

  -- Endereco
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,

  -- O que fornece (multi-categoria)
  -- valores: tecido, aviamento, embalagem, etiqueta,
  --         linha, botao, zipper, papelaria, outro
  categorias TEXT[] NOT NULL DEFAULT '{}',

  -- Comercial
  prazo_entrega_dias INT,
  condicoes_pagamento TEXT,
  valor_minimo_pedido NUMERIC,

  -- Meta
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  avaliacao NUMERIC CHECK (avaliacao BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_categorias ON fornecedores USING GIN(categorias);
CREATE INDEX IF NOT EXISTS idx_fornecedores_ativo ON fornecedores(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON fornecedores(cnpj) WHERE cnpj IS NOT NULL;

-- 6.2) Adicionar FK em fabrics (categoria + fornecedor_id)
ALTER TABLE fabrics   ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES fornecedores(id);
ALTER TABLE fabrics   ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES fornecedores(id);

-- 6.3) Migracao de dados (supplier TEXT -> fornecedores)
-- Copia distintos, fica seguro mesmo se rodar varias vezes
INSERT INTO fornecedores (nome, categorias)
SELECT DISTINCT TRIM(supplier), ARRAY['outro']::TEXT[]
FROM fabrics
WHERE COALESCE(TRIM(supplier),'') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM fornecedores f WHERE f.nome = TRIM(fabrics.supplier)
  );

UPDATE fabrics SET fornecedor_id = f.id
FROM fornecedores f
WHERE TRIM(fabrics.supplier) = f.nome AND fabrics.fornecedor_id IS NULL;

UPDATE purchases SET fornecedor_id = f.id
FROM fornecedores f
WHERE TRIM(purchases.supplier) = f.nome AND purchases.fornecedor_id IS NULL;

-- 6.4) RLS
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados leem fornecedores" ON fornecedores;
CREATE POLICY "Todos autenticados leem fornecedores" ON fornecedores
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin/gerente inserem fornecedores" ON fornecedores;
CREATE POLICY "Admin/gerente inserem fornecedores" ON fornecedores
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerente'))
  );

DROP POLICY IF EXISTS "Admin/gerente atualizam fornecedores" ON fornecedores;
CREATE POLICY "Admin/gerente atualizam fornecedores" ON fornecedores
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerente'))
  );

DROP POLICY IF EXISTS "Admin deleta fornecedores" ON fornecedores;
CREATE POLICY "Admin deleta fornecedores" ON fornecedores
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6.5) Atualizar permissoes padrao (adicionar 'fornecedores' na matriz)
-- merge: nao sobrescreve chaves existentes
UPDATE role_permissions
SET permissions = permissions || jsonb_build_object(
  'gerente',    (COALESCE(permissions->'gerente','{}'::jsonb)    || '{"fornecedores":true,"fornecedores_editar":true}'::jsonb),
  'estoquista', (COALESCE(permissions->'estoquista','{}'::jsonb) || '{"fornecedores":true,"fornecedores_editar":false}'::jsonb),
  'costureira', (COALESCE(permissions->'costureira','{}'::jsonb) || '{"fornecedores":false,"fornecedores_editar":false}'::jsonb)
),
updated_at = now()
WHERE id = 1;

-- 6.6) Trigger pra updated_at automatico
CREATE OR REPLACE FUNCTION touch_fornecedores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fornecedores_updated_at ON fornecedores;
CREATE TRIGGER trg_fornecedores_updated_at
  BEFORE UPDATE ON fornecedores
  FOR EACH ROW EXECUTE FUNCTION touch_fornecedores_updated_at();
