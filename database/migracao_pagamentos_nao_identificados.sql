-- Rode isso uma vez no SQL Editor do Supabase.
-- Tabela pra guardar lançamentos do Sistema (Conciliação) que a Fernanda
-- não conseguiu identificar como foram pagos de verdade — fica de lado,
-- sem entrar no Faturamento Bruto nem nos totais, até ela descobrir o que
-- aconteceu e remover da lista (ou lançar manualmente).

CREATE TABLE IF NOT EXISTS pagamentos_nao_identificados (
  id BIGINT PRIMARY KEY,
  chave VARCHAR(255) NOT NULL UNIQUE,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  data DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE pagamentos_nao_identificados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON pagamentos_nao_identificados;
CREATE POLICY "Acesso total" ON pagamentos_nao_identificados FOR ALL USING (true) WITH CHECK (true);
