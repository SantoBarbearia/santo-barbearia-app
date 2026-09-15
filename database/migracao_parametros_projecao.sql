-- Rode isso uma vez no SQL Editor do Supabase.
-- Guarda os parâmetros usados pra calcular a Projeção de Faturamento no
-- Dashboard: a data em que os preços subiram e o % desse aumento — usados
-- pra ajustar o faturamento do mesmo mês do ano anterior antes de usá-lo
-- como base da projeção do mês correspondente do ano atual.

CREATE TABLE IF NOT EXISTS parametros_projecao (
  id BIGINT PRIMARY KEY DEFAULT 1,
  data_aumento DATE,
  percentual_aumento DECIMAL(6, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE parametros_projecao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON parametros_projecao;
CREATE POLICY "Acesso total" ON parametros_projecao FOR ALL USING (true) WITH CHECK (true);
