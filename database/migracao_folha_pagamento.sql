-- Rode isso uma vez no SQL Editor do Supabase.
--
-- Folha de Pagamento: funcionários com salário fixo (ex: Maria Paula,
-- estagiária) usam um cálculo diferente dos barbeiros — não têm comissão,
-- só salário base menos consumo do período. Por isso ficam numa aba/tabela
-- separada da de "comissoes", em vez de forçar esse pessoal a caber no
-- mesmo modelo dos barbeiros.
--
-- "funcionarios_fixos" guarda o estado atual (1 linha por funcionário,
-- igual uma "comissoes" em miniatura): salário base (editável na tela) e o
-- consumo acumulado desde o último pagamento fechado.
CREATE TABLE IF NOT EXISTS funcionarios_fixos (
  chave VARCHAR(50) PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  salario_base DECIMAL(10, 2) NOT NULL DEFAULT 0,
  consumo DECIMAL(10, 2) NOT NULL DEFAULT 0
);

-- "pagamentos_funcionarios_fixos" é o histórico dos recibos já fechados
-- (igual "fechamentos" pros barbeiros) — cada linha é um pagamento gerado
-- pelo botão "Fechar Pagamento", com os números detalhados que foram pro
-- recibo em PDF.
CREATE TABLE IF NOT EXISTS pagamentos_funcionarios_fixos (
  id BIGINT PRIMARY KEY,
  "funcionarioChave" VARCHAR(50) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  "salarioBase" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  consumo DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "totalPago" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "dataPagamento" DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE funcionarios_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_funcionarios_fixos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON funcionarios_fixos;
CREATE POLICY "Acesso total" ON funcionarios_fixos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total" ON pagamentos_funcionarios_fixos;
CREATE POLICY "Acesso total" ON pagamentos_funcionarios_fixos FOR ALL USING (true) WITH CHECK (true);

INSERT INTO funcionarios_fixos (chave, nome, salario_base, consumo)
VALUES ('mariapaula', 'Maria Paula', 671.00, 0)
ON CONFLICT (chave) DO NOTHING;
