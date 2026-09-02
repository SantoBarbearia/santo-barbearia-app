-- Rode isso uma vez no SQL Editor do Supabase.
--
-- A chave nova do Supabase ("Publishable key", que substituiu a antiga
-- "anon key") exige Row Level Security (RLS) habilitado nas tabelas pra
-- liberar escrita (inserir/editar/excluir) pelo navegador — mesmo que a
-- leitura continue livre sem isso. Como esse app não tem login (é uso
-- interno só da barbearia), a política abaixo libera acesso total pra
-- todo mundo que tiver a chave publishable, reproduzindo o mesmo
-- comportamento de antes, só que de um jeito que a chave nova aceita.

ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_dashboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_contabeis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON contas;
CREATE POLICY "Acesso total" ON contas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON contas_pagar;
CREATE POLICY "Acesso total" ON contas_pagar FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON comissoes;
CREATE POLICY "Acesso total" ON comissoes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON movimentacoes;
CREATE POLICY "Acesso total" ON movimentacoes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON fechamentos;
CREATE POLICY "Acesso total" ON fechamentos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON notas_dashboard;
CREATE POLICY "Acesso total" ON notas_dashboard FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON categorias_contabeis;
CREATE POLICY "Acesso total" ON categorias_contabeis FOR ALL USING (true) WITH CHECK (true);
