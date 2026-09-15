-- Rode isso uma vez no SQL Editor do Supabase.
-- Adiciona a coluna do % de Crescimento (orgânico, separado do % de Aumento
-- de Preço) usado na Projeção de Faturamento do Dashboard — os dois juntos
-- (somados) formam o ajuste aplicado sobre o mesmo mês do ano anterior.

CREATE TABLE IF NOT EXISTS parametros_projecao (
  id BIGINT PRIMARY KEY DEFAULT 1,
  data_aumento DATE,
  percentual_aumento DECIMAL(6, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE parametros_projecao ADD COLUMN IF NOT EXISTS percentual_crescimento DECIMAL(6, 2);

ALTER TABLE parametros_projecao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON parametros_projecao;
CREATE POLICY "Acesso total" ON parametros_projecao FOR ALL USING (true) WITH CHECK (true);
