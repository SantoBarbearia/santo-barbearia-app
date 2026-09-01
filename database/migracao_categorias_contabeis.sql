-- Rode isso uma vez no SQL Editor do Supabase.
-- Cria a tabela de Classificações Contábeis em dois níveis (Nível 1 / Nível 2),
-- editável direto pelo app (aba Dashboard), e migra a lista fixa antiga para lá.
-- As contas a pagar e movimentações antigas continuam com a categoria de nível
-- único que já tinham (ex: "Aluguel e Ocupação") — elas não são alteradas.
-- Novas classificações combinadas ficam salvas como "Nível1 > Nível2".

CREATE TABLE IF NOT EXISTS categorias_contabeis (
  id BIGINT PRIMARY KEY,
  nivel1 VARCHAR(100) NOT NULL,
  nivel2 VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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
