-- Rode isso uma vez no SQL Editor do Supabase.
-- Tabela pra guardar quais transações do Relatório de Transações Financeiras
-- (assinaturas cobradas pelo próprio Cash Barber) já foram incluídas num
-- resgate lançado na Conta Corrente — sem isso, reenviar o mesmo relatório
-- numa conciliação futura faria elas voltarem a aparecer como pendentes em
-- "Aguardando Resgate do Cash Barber" e correr o risco de lançar de novo.

CREATE TABLE IF NOT EXISTS resgates_cashbarber_lancados (
  transacao_id VARCHAR(255) PRIMARY KEY,
  cliente VARCHAR(255),
  valor_bruto DECIMAL(10, 2) NOT NULL,
  valor_desconto DECIMAL(10, 2) DEFAULT 0,
  valor_liquido DECIMAL(10, 2),
  data_transacao DATE,
  data_liquidacao DATE,
  data_resgate DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE resgates_cashbarber_lancados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON resgates_cashbarber_lancados;
CREATE POLICY "Acesso total" ON resgates_cashbarber_lancados FOR ALL USING (true) WITH CHECK (true);
