-- Rode isso uma vez no SQL Editor do Supabase.
-- Adiciona: classificação contábil (categoria) e contas recorrentes.
-- Também corrige uma coluna que faltava desde o recurso "Desfazer Pagamento"
-- (sem ela, o desfazer não estava sendo salvo de verdade no banco).

ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS recorrente BOOLEAN DEFAULT FALSE;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "grupoRecorrente" BIGINT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "repeticoesRestantes" INTEGER DEFAULT 0;

ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS "contaPagarId" BIGINT;
