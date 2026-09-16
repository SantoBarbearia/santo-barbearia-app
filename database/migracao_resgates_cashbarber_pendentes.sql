-- Rode isso uma vez no SQL Editor do Supabase.
-- 1) Guarda os dados completos de um "Pagamento Não Identificado" pra que,
--    quando ela descobrir a forma de pagamento e remover da lista, o
--    lançamento volte pro Faturamento Bruto do Sistema pronto pra casar/
--    lançar — sem essa coluna, ele simplesmente sumia (não tinha como
--    reconstruir o lançamento original, já que o id do upload é recriado a
--    cada relatório enviado).
ALTER TABLE pagamentos_nao_identificados ADD COLUMN IF NOT EXISTS dados_completos JSONB;

-- 2) Tabela pra guardar as transações do Relatório de Transações Financeiras
--    (assinaturas cobradas pelo próprio Cash Barber) assim que aparecem numa
--    conciliação — sem isso, o card "Aguardando Resgate do Cash Barber"
--    dependia só do relatório carregado NAQUELA sessão e sumia ao recarregar
--    a página. Igual "Pagamentos Não Identificados", fica esperando aqui até
--    ela lançar o resgate (ver resgates_cashbarber_lancados).
CREATE TABLE IF NOT EXISTS resgates_cashbarber_pendentes (
  transacao_id VARCHAR(255) PRIMARY KEY,
  cliente VARCHAR(255),
  descricao VARCHAR(255),
  valor_bruto DECIMAL(10, 2) NOT NULL,
  valor_liquido DECIMAL(10, 2),
  desconto DECIMAL(10, 2) DEFAULT 0,
  data_transacao DATE,
  data_liquidacao DATE,
  casada BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE resgates_cashbarber_pendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON resgates_cashbarber_pendentes;
CREATE POLICY "Acesso total" ON resgates_cashbarber_pendentes FOR ALL USING (true) WITH CHECK (true);
