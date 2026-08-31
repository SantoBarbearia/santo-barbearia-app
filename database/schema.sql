-- Tabela de Contas
CREATE TABLE IF NOT EXISTS contas (
  id BIGINT PRIMARY KEY DEFAULT 1,
  caixa DECIMAL(10, 2) DEFAULT 0,
  cofre DECIMAL(10, 2) DEFAULT 0,
  reserva DECIMAL(10, 2) DEFAULT 0,
  sicredi DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Contas a Pagar
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

-- Tabela de Comissões
CREATE TABLE IF NOT EXISTS comissoes (
  id BIGINT PRIMARY KEY DEFAULT 1,
  eduardo_servicos DECIMAL(10, 2) DEFAULT 0,
  eduardo_produtos DECIMAL(10, 2) DEFAULT 0,
  eduardo_assinatura DECIMAL(10, 2) DEFAULT 0,
  eduardo_vale DECIMAL(10, 2) DEFAULT 0,
  eduardo_consumo DECIMAL(10, 2) DEFAULT 0,
  eduardo_mei DECIMAL(10, 2) DEFAULT 86.05,
  gabriel_servicos DECIMAL(10, 2) DEFAULT 0,
  gabriel_produtos DECIMAL(10, 2) DEFAULT 0,
  gabriel_assinatura DECIMAL(10, 2) DEFAULT 0,
  gabriel_vale DECIMAL(10, 2) DEFAULT 0,
  gabriel_consumo DECIMAL(10, 2) DEFAULT 0,
  gabriel_mei DECIMAL(10, 2) DEFAULT 86.05,
  thais_servicos DECIMAL(10, 2) DEFAULT 0,
  thais_produtos DECIMAL(10, 2) DEFAULT 0,
  thais_assinatura DECIMAL(10, 2) DEFAULT 0,
  thais_vale DECIMAL(10, 2) DEFAULT 0,
  thais_consumo DECIMAL(10, 2) DEFAULT 0,
  thais_mei DECIMAL(10, 2) DEFAULT 86.05,
  thiago_servicos DECIMAL(10, 2) DEFAULT 0,
  thiago_produtos DECIMAL(10, 2) DEFAULT 0,
  thiago_assinatura DECIMAL(10, 2) DEFAULT 0,
  thiago_vale DECIMAL(10, 2) DEFAULT 0,
  thiago_consumo DECIMAL(10, 2) DEFAULT 0,
  thiago_mei DECIMAL(10, 2) DEFAULT 86.05,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Movimentações
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

-- Tabela de Fechamentos Mensais (histórico do resumo de faturamento/comissões)
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

-- Tabela de Observações do Dashboard (notas/eventos livres)
CREATE TABLE IF NOT EXISTS notas_dashboard (
  id BIGINT PRIMARY KEY,
  data DATE NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) - Modo teste (desabilitado por enquanto)
-- ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE comissoes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;

-- Inserir registros iniciais
INSERT INTO contas (id, caixa, cofre, reserva, sicredi) 
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO comissoes (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
