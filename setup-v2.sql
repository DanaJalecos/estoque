-- ============================================
-- DANA JALECOS — Setup V2 (Perfis + Admin)
-- Cole no SQL Editor do Supabase e clique RUN
-- ============================================

-- Tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para perfis
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Todos podem ver perfis (pra mostrar nomes)
CREATE POLICY "Anyone can view profiles" ON profiles FOR SELECT USING (true);
-- Cada um edita só o seu perfil
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Atualizar tabela fabrics: remover restrição por user_id no SELECT (admin precisa ver tudo)
DROP POLICY IF EXISTS "Users can view own fabrics" ON fabrics;
CREATE POLICY "Users can view all fabrics" ON fabrics FOR SELECT USING (true);

-- Atualizar movimentações: todos podem ver (admin precisa ver tudo)
DROP POLICY IF EXISTS "Users can view own movements" ON movements;
CREATE POLICY "Users can view all movements" ON movements FOR SELECT USING (true);

-- Criar perfil automaticamente quando alguém se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (new.id, '', 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar perfil auto
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
