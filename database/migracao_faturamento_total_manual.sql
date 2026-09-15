-- Rode isso uma vez no SQL Editor do Supabase.
-- Adiciona a coluna que guarda o Faturamento Total digitado manualmente para
-- meses antigos (sem movimentação lançada no sistema), pra dar pra montar um
-- histórico no Resumo para Contabilidade do Dashboard.

CREATE TABLE IF NOT EXISTS faturamento_manual (
  mes VARCHAR(7) PRIMARY KEY,
  faturamento_produtos DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE faturamento_manual ADD COLUMN IF NOT EXISTS faturamento_total DECIMAL(10, 2);

ALTER TABLE faturamento_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON faturamento_manual;
CREATE POLICY "Acesso total" ON faturamento_manual FOR ALL USING (true) WITH CHECK (true);
