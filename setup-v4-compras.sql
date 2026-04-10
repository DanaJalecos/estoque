-- ============================================
-- DANA JALECOS — V4: Histórico de Compras
-- Cole no SQL Editor do Supabase e clique RUN
-- ============================================

-- Tabela de compras (registra cada compra com preço)
CREATE TABLE IF NOT EXISTS purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
  supplier TEXT DEFAULT '',
  qty NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  nf_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all purchases" ON purchases FOR SELECT USING (true);
CREATE POLICY "Users can insert purchases" ON purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own purchases" ON purchases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin can delete purchases" ON purchases FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
