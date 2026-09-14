-- Rode isso uma vez no SQL Editor do Supabase.
-- Guarda o faturamento de produtos digitado manualmente no Resumo para
-- Contabilidade do Dashboard, um valor por mês (o faturamento de serviços é
-- calculado: faturamento total das entradas de Receitas > Produtos/Serviços
-- menos esse valor de produtos).

CREATE TABLE IF NOT EXISTS faturamento_manual (
  mes VARCHAR(7) PRIMARY KEY,
  faturamento_produtos DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE faturamento_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON faturamento_manual;
CREATE POLICY "Acesso total" ON faturamento_manual FOR ALL USING (true) WITH CHECK (true);
