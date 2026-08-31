-- Rode isso uma vez no SQL Editor do Supabase.
-- Cria as tabelas usadas pelo novo Dashboard (histórico de fechamentos mensais
-- e observações/notas).

CREATE TABLE IF NOT EXISTS fechamentos (
  id BIGINT PRIMARY KEY,
  mes VARCHAR(7) NOT NULL,
  "mesLabel" VARCHAR(20),
  "faturamentoServicos" DECIMAL(10, 2) DEFAULT 0,
  "faturamentoProdutos" DECIMAL(10, 2) DEFAULT 0,
  "faturamentoAssinatura" DECIMAL(10, 2) DEFAULT 0,
  "comissaoBruta" DECIMAL(10, 2) DEFAULT 0,
  "totalVale" DECIMAL(10, 2) DEFAULT 0,
  "totalConsumo" DECIMAL(10, 2) DEFAULT 0,
  "totalMei" DECIMAL(10, 2) DEFAULT 0,
  "comissaoLiquida" DECIMAL(10, 2) DEFAULT 0,
  "dataFechamento" DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notas_dashboard (
  id BIGINT PRIMARY KEY,
  data DATE NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
