-- Rode isso uma vez no SQL Editor do Supabase.
-- Cria a tabela que guarda os dados da empresa (logo e informações que
-- aparecem no cabeçalho do sistema e nos relatórios exportados em Excel/PDF).

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

ALTER TABLE dados_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON dados_empresa;
CREATE POLICY "Acesso total" ON dados_empresa FOR ALL USING (true) WITH CHECK (true);

INSERT INTO dados_empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
