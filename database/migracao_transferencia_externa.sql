-- Adiciona a coluna que marca uma Transferência como "troca de dinheiro com
-- cliente" (ex: ele manda Pix pra Conta Corrente e recebe o equivalente em
-- dinheiro do Caixa) em vez de remanejamento interno de verdade. Rode este
-- script no SQL Editor do Supabase.

ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS externa BOOLEAN DEFAULT FALSE;
