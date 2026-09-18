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
  "dataPagamento" DATE,
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
  -- Só uma sinalização visual (não gera lançamentos futuros automaticamente,
  -- diferente da recorrência de Contas a Pagar).
  recorrente BOOLEAN DEFAULT FALSE,
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

-- Tabela de Classificações Contábeis (dois níveis, editável pelo usuário)
CREATE TABLE IF NOT EXISTS categorias_contabeis (
  id BIGINT PRIMARY KEY,
  nivel1 VARCHAR(100) NOT NULL,
  nivel2 VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Dados da Empresa (logo + dados que aparecem no cabeçalho do
-- sistema e nos relatórios exportados)
CREATE TABLE IF NOT EXISTS dados_empresa (
  id BIGINT PRIMARY KEY DEFAULT 1,
  razao_social VARCHAR(255) DEFAULT '',
  cnpj VARCHAR(30) DEFAULT '',
  endereco VARCHAR(255) DEFAULT '',
  responsavel_adm VARCHAR(255) DEFAULT '',
  telefone_comercial VARCHAR(30) DEFAULT '',
  telefone_responsavel VARCHAR(30) DEFAULT '',
  logo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Faturamento Manual (faturamento de produtos digitado à mão por
-- mês, no Resumo para Contabilidade do Dashboard)
CREATE TABLE IF NOT EXISTS faturamento_manual (
  mes VARCHAR(7) PRIMARY KEY,
  faturamento_produtos DECIMAL(10, 2) DEFAULT 0,
  faturamento_total DECIMAL(10, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Parâmetros de Projeção (data e % do aumento de preço, usados
-- pra calcular a Projeção de Faturamento no Dashboard)
CREATE TABLE IF NOT EXISTS parametros_projecao (
  id BIGINT PRIMARY KEY DEFAULT 1,
  data_aumento DATE,
  percentual_aumento DECIMAL(6, 2),
  percentual_crescimento DECIMAL(6, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Pagamentos Não Identificados (Conciliação) — lançamento do
-- Sistema que a Fernanda não conseguiu identificar como foi pago; fica de
-- lado, sem entrar no Faturamento Bruto, até ela descobrir e remover da lista.
CREATE TABLE IF NOT EXISTS pagamentos_nao_identificados (
  id BIGINT PRIMARY KEY,
  chave VARCHAR(255) NOT NULL UNIQUE,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  data DATE,
  -- Dados completos do lançamento original (Faturamento Bruto do Sistema) —
  -- permite devolver ele pra conciliação, pronto pra casar/lançar, quando ela
  -- descobrir a forma de pagamento e remover da lista.
  dados_completos JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de Resgates do Cash Barber Pendentes (Conciliação) — guarda as
-- transações do Relatório de Transações Financeiras (assinaturas cobradas
-- pelo próprio Cash Barber) assim que aparecem numa conciliação, pra não
-- depender de reenviar esse relatório em toda conciliação futura só pra ver
-- o que ainda está aguardando resgate.
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

-- Tabela de Resgates do Cash Barber Lançados (Conciliação) — controla quais
-- transações do Relatório de Transações Financeiras (assinaturas cobradas
-- pelo próprio Cash Barber) já foram incluídas num resgate lançado na Conta
-- Corrente, pra não voltarem a aparecer como pendentes numa conciliação
-- futura nem correrem o risco de ser lançadas de novo.
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

-- Habilitar RLS (Row Level Security). A chave "Publishable key" do Supabase
-- exige RLS habilitado pra liberar escrita pelo navegador (mesmo que a
-- leitura funcione sem isso) — sem essa política, inserir/editar/excluir
-- falha em silêncio (erro de rede no navegador). Como o app não tem login
-- (uso interno da barbearia), a política libera acesso total.
ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_dashboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_contabeis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturamento_manual ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametros_projecao ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_nao_identificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE resgates_cashbarber_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resgates_cashbarber_lancados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total" ON contas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON contas_pagar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON comissoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON movimentacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON fechamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON notas_dashboard FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON categorias_contabeis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON dados_empresa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON faturamento_manual FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON parametros_projecao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON pagamentos_nao_identificados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON resgates_cashbarber_pendentes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON resgates_cashbarber_lancados FOR ALL USING (true) WITH CHECK (true);

-- Inserir registros iniciais
INSERT INTO contas (id, caixa, cofre, reserva, sicredi) 
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO comissoes (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dados_empresa (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categorias_contabeis (id, nivel1, nivel2) VALUES
  (1, 'Receitas', 'Serviços'),
  (2, 'Receitas', 'Produtos'),
  (3, 'Receitas', 'Outras Receitas'),
  (4, 'Custos de Ocupação', 'Aluguel'),
  (5, 'Custos de Ocupação', 'Água, Luz e Internet'),
  (6, 'Pessoal', 'Salários e Comissões'),
  (7, 'Obrigações Tributárias', 'Simples Nacional'),
  (8, 'Obrigações Tributárias', 'Outras Taxas e Impostos'),
  (9, 'Fornecedores', 'Fornecedores e Produtos'),
  (10, 'Taxas de Cartão/Maquininha', 'MDR (Taxa da Maquininha)'),
  (11, 'Taxas de Cartão/Maquininha', 'Antecipação'),
  (12, 'Assinaturas e Sistemas', 'Assinaturas e Sistemas'),
  (13, 'Marketing', 'Marketing e Publicidade'),
  (14, 'Manutenção', 'Manutenção e Reparos'),
  (15, 'Serviços Profissionais', 'Contábeis/Jurídicos'),
  (16, 'Outras Despesas', 'Outras Despesas')
ON CONFLICT (id) DO NOTHING;
