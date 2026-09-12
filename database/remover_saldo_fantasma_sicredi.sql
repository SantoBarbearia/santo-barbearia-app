-- Rode isso UMA VEZ no SQL Editor do Supabase.
--
-- Você confirmou que os R$ 129,50 NÃO são dinheiro real (não batem com o
-- extrato do Sicredi) — então, ao contrário da correção anterior
-- (corrigir_saldo_fantasma_sicredi.sql, que só documentava o valor como se
-- fosse dinheiro de verdade), agora vamos tirar esse valor de vez: do
-- lançamento que criamos por engano E do saldo da Conta Corrente.
--
-- 1) Remove o lançamento de "Saldo inicial" que criamos na correção anterior
--    (ele tinha o id 1700000000000) — não faz mais sentido já que o valor
--    não é real.
DELETE FROM movimentacoes WHERE id = 1700000000000;

-- 2) Tira os R$ 129,50 do saldo da Conta Corrente (Sicredi) — isso FAZ o
--    saldo de hoje da Conta Corrente diminuir R$ 129,50. Só rode isso se
--    você já conferiu que o saldo de hoje, SEM esses R$ 129,50, é o valor
--    certo que bate com o extrato do banco.
UPDATE contas SET sicredi = sicredi - 129.50 WHERE id = 1;
