-- Rode isso uma vez no SQL Editor do Supabase.
-- Permite marcar uma conta a pagar recorrente como semanal (em vez de
-- sempre mensal, que era o único jeito até agora).
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS frequencia VARCHAR(20) DEFAULT 'mensal';
