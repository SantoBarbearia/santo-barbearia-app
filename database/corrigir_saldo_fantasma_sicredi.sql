-- Rode isso UMA VEZ no SQL Editor do Supabase.
--
-- O que está acontecendo: a Conta Corrente (Sicredi) tem R$ 129,50 gravados
-- direto na tabela "contas" desde antes de qualquer movimentação ter sido
-- registrada (provavelmente de um ajuste manual feito direto no banco em
-- algum momento anterior). Como esse valor não é uma movimentação com data,
-- o cálculo de "Saldo Anterior" da Visão Geral não tem como saber que ele já
-- existia — ele aparece "vazando" pra QUALQUER período que você filtrar,
-- mesmo um período bem antigo.
--
-- Esse comando NÃO muda o saldo de hoje (ele já está certo) — só documenta
-- esse valor como um lançamento de "Saldo inicial", com uma data antiga
-- (01/01/2026, antes de qualquer conciliação que você já fez). Depois disso,
-- o "Saldo Anterior" de qualquer período a partir de 2026 vai incluir esse
-- valor corretamente (porque agora ele tem uma data), e só vai desaparecer
-- se você filtrar um período anterior a 01/01/2026 — o que faz sentido,
-- porque antes dessa data a conta realmente não tinha nada.
--
-- Depois de rodar, recarregue o app e confira: o saldo de hoje da Conta
-- Corrente continua exatamente igual, e o "Saldo Anterior" de julho/agosto
-- não vai mais mostrar R$ 129,50 fantasma.

INSERT INTO movimentacoes (id, data, tipo, descricao, valor, conta, categoria)
VALUES (
  1700000000000,
  '2026-01-01',
  'Crédito Manual',
  'Saldo inicial da Conta Corrente (documentando valor que já existia no saldo)',
  129.50,
  'sicredi',
  'Receitas > Outros'
);
