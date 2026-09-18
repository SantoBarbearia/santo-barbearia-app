-- Rode isso uma vez no SQL Editor do Supabase.
-- Marca uma movimentação já lançada (Visão Geral) como recorrente — só uma
-- sinalização visual (não gera lançamentos futuros automaticamente, é
-- diferente da recorrência de Contas a Pagar).
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS recorrente BOOLEAN DEFAULT FALSE;
