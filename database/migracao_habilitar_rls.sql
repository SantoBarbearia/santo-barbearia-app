-- Rode isso uma vez no SQL Editor do Supabase.
--
-- A chave nova do Supabase ("Publishable key", que substituiu a antiga
-- "anon key") exige Row Level Security (RLS) habilitado nas tabelas pra
-- liberar escrita (inserir/editar/excluir) pelo navegador — mesmo que a
-- leitura continue livre sem isso. Como esse app não tem login (é uso
-- interno só da barbearia), a política abaixo libera acesso total pra
-- todo mundo que tiver a chave publishable, reproduzindo o mesmo
-- comportamento de antes, só que de um jeito que a chave nova aceita.
--
-- Também recria (se estiver faltando) qualquer tabela que porventura não
-- tenha sido criada numa migração anterior, pra esse script não travar no
-- meio — "CREATE TABLE IF NOT EXISTS" não faz nada se a tabela já existir.

CREATE TABLE IF NOT EXISTS contas (
  id BIGINT PRIMARY KEY DEFAULT 1,
  caixa DECIMAL(10, 2) DEFAULT 0,
  cofre DECIMAL(10, 2) DEFAULT 0,
  reserva DECIMAL(10, 2) DEFAULT 0,
  sicredi DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contas_pagar (
  id BIGINT PRIMARY KEY,
  data DATE NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  vencimento DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'Aberto',
  conta VARCHAR(50),
  categoria VARCHAR(100),
  recorrente BOOLEAN DEFAULT FALSE,
  "grupoRecorrente" BIGINT,
  "repeticoesRestantes" INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comissoes (
  id BIGINT PRIMARY KEY DEFAULT 1,
  eduardo_servicos DECIMAL(10, 2) DEFAULT 0,
  eduardo_produtos DECIMAL(10, 2) DEFAULT 0,
  eduardo_assinatura DECIMAL(10, 2) DEFAULT 0,
  eduardo_vale DECIMAL(10, 2) DEFAULT 0,
  eduardo_consumo DECIMAL(10, 2) DEFAULT 0,
  eduardo_mei DECIMAL(10, 2) DEFAULT 0,
  gabriel_servicos DECIMAL(10, 2) DEFAULT 0,
  gabriel_produtos DECIMAL(10, 2) DEFAULT 0,
  gabriel_assinatura DECIMAL(10, 2) DEFAULT 0,
  gabriel_vale DECIMAL(10, 2) DEFAULT 0,
  gabriel_consumo DECIMAL(10, 2) DEFAULT 0,
  gabriel_mei DECIMAL(10, 2) DEFAULT 0,
  thais_servicos DECIMAL(10, 2) DEFAULT 0,
  thais_produtos DECIMAL(10, 2) DEFAULT 0,
  thais_assinatura DECIMAL(10, 2) DEFAULT 0,
  thais_vale DECIMAL(10, 2) DEFAULT 0,
  thais_consumo DECIMAL(10, 2) DEFAULT 0,
  thais_mei DECIMAL(10, 2) DEFAULT 0,
  thiago_servicos DECIMAL(10, 2) DEFAULT 0,
  thiago_produtos DECIMAL(10, 2) DEFAULT 0,
  thiago_assinatura DECIMAL(10, 2) DEFAULT 0,
  thiago_vale DECIMAL(10, 2) DEFAULT 0,
  thiago_consumo DECIMAL(10, 2) DEFAULT 0,
  thiago_mei DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimentacoes (
  id BIGINT PRIMARY KEY,
  data DATE NOT NULL,
  tipo VARCHAR(100) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  conta VARCHAR(50),
  de VARCHAR(50),
  para VARCHAR(50),
  categoria VARCHAR(100),
  "contaPagarId" BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS categorias_contabeis (
  id BIGINT PRIMARY KEY,
  nivel1 VARCHAR(100) NOT NULL,
  nivel2 VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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

-- Garante os registros base de contas/comissões (não faz nada se já existirem)
INSERT INTO contas (id, caixa, cofre, reserva, sicredi)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO comissoes (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
