-- Rode isso AGORA, uma vez, no SQL Editor do Supabase.
-- Adiciona a coluna "dataPagamento" que faltava em contas_pagar — sem ela, salvar
-- qualquer conta com essa informação (recurso de data de pagamento editável) derruba
-- o INSERT inteiro, e como o app apaga tudo antes de reinserir a cada salvamento,
-- isso pode ter esvaziado a tabela contas_pagar. Depois de rodar essa migração,
-- confira em Table Editor → contas_pagar se as contas que você espera ver ainda
-- estão lá; qualquer uma que tiver sumido precisa ser recriada manualmente.

ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "dataPagamento" DATE;
