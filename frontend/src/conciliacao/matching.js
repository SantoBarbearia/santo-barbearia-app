function diasEntre(dataIsoA, dataIsoB) {
  return Math.abs((new Date(dataIsoA) - new Date(dataIsoB)) / 86400000);
}

// Quando os dois lados trazem horário (ex: comanda fechada às 14:30 x venda
// registrada às 14:32 na maquininha), compara minuto a minuto em vez de só o
// dia — mais preciso pra desempatar comandas de mesmo valor no mesmo dia.
// Sem dataHora de um dos lados, cai pra meia-noite (equivalente a comparar só
// a data, igual ao comportamento anterior).
function minutosEntre(a, b) {
  const tempoA = new Date(a.dataHora || a.data).getTime();
  const tempoB = new Date(b.dataHora || b.data).getTime();
  return Math.abs(tempoA - tempoB) / 60000;
}

function normalizarNomeParaComparacao(texto) {
  return String(texto || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tenta extrair só o nome de pessoa de uma descrição, reconhecendo os formatos
// mais comuns (Pix recebido do banco, comanda do sistema) — quando não
// reconhece nenhum dos dois formatos, devolve null em vez de arriscar
// comparar texto genérico como se fosse nome.
function extrairNomeDaDescricao(descricao) {
  const texto = String(descricao || '');

  const matchPix = texto.match(/PIX[_ -]?CRED\s*[\d.\-\/]*\s*(.+)$/i);
  if (matchPix) return normalizarNomeParaComparacao(matchPix[1]);

  const matchComanda = texto.match(/^Comanda\s+(?:\([^)]*\)\s*)?(?:\d+\s*-\s*)?(.+?)\s*-\s*\d{2}\/\d{2}\/\d{4}/i);
  if (matchComanda) return normalizarNomeParaComparacao(matchComanda[1]);

  return null;
}

// Quantas palavras do nome mais curto aparecem no nome mais longo — cobre o
// caso comum de o extrato trazer só o primeiro nome ("Diego") e a comanda
// trazer o nome completo ("Diego Rodrigo da Silva Souza").
function similaridadeNomes(nomeA, nomeB) {
  if (!nomeA || !nomeB) return 0;
  const palavrasA = nomeA.split(' ').filter((p) => p.length > 1);
  const palavrasB = new Set(nomeB.split(' ').filter((p) => p.length > 1));
  if (palavrasA.length === 0 || palavrasB.size === 0) return 0;
  const comuns = palavrasA.filter((p) => palavrasB.has(p)).length;
  return comuns / Math.min(palavrasA.length, palavrasB.size);
}

// Casa os itens de listaA com os de listaB: mesmo valor, dentro da
// tolerância de dias, priorizando primeiro quem tem o nome mais parecido
// (útil em Pix, onde o extrato e a comanda costumam trazer o nome de quem
// pagou) e depois quem tem o horário mais próximo (útil em cartão, onde a
// comanda fechada e a venda na maquininha costumam ter o horário bem
// parecido). Quando nenhum dos dois lados tem nome ou horário reconhecível,
// o desempate cai de volta pra data mais próxima, exatamente como antes.
//
// Os pares são escolhidos GLOBALMENTE pelo melhor casamento primeiro (maior
// similaridade, depois menor diferença de minutos), não item por item na
// ordem de listaA. Isso importa porque duas comandas de mesmo valor no mesmo
// dia (ex: dois cortes de R$13,50) podiam antes deixar a comanda processada
// primeiro "roubar" a venda mais próxima em horário de uma comanda processada
// depois, mesmo quando essa segunda comanda era o casamento certo e a
// primeira tinha uma venda melhor disponível — sobrando as duas sem
// correspondência pra casar manualmente por causa só da ordem de
// processamento. Escolhendo o melhor par entre TODOS os candidatos possíveis
// primeiro, cada lado fica livre pra pegar o par mais próximo dele quando
// existir mais de um candidato de mesmo valor.
//
// Com opcoes.exigirNome, um casamento só é confirmado automaticamente se
// tiver algum sinal de nome batendo (similaridade > 0) — sem isso, cai pra
// "sem correspondência" dos dois lados, esperando confirmação manual. Existe
// porque, sem esse sinal, o valor+data sozinho pode casar a pessoa errada:
// alguém pagou mas não foi lançado no sistema, outra pessoa foi lançada mas
// não pagou — e um casamento automático "às cegas" deixaria a pessoa errada
// parecendo inadimplente (ou parecendo paga sem ter pago).
// Retorna os pares batidos e o que sobrou sem correspondência de cada lado.
// opcoes.compativel(a, b) é um filtro extra além de valor+data — usado pra
// exigir, no casamento de cartão, que tipo (Débito/Crédito) e bandeira
// também batam, não só valor e horário próximo (duas vendas de mesmo valor
// no mesmo horário mas de bandeiras/tipos diferentes não deviam casar entre
// si). Quando um dos lados não tem essa informação, o filtro deixa passar
// (não bloqueia por falta de dado).
export function conciliar(listaA, listaB, toleranciaDias = 3, opcoes = {}) {
  const { exigirNome = false, compativel = null } = opcoes;

  // Monta todo candidato (a, b) válido por valor+data+compativel, com o
  // "escore" de desempate (similaridade de nome, depois minutos de
  // diferença) — sem escolher nada ainda.
  const candidatos = [];
  listaA.forEach((a, indiceA) => {
    const nomeA = extrairNomeDaDescricao(a.descricao);
    listaB.forEach((b, indiceB) => {
      if (Math.abs(a.valor - b.valor) > 0.01) return;
      const dias = diasEntre(a.data, b.data);
      if (dias > toleranciaDias) return;
      if (compativel && !compativel(a, b)) return;
      const similaridade = similaridadeNomes(nomeA, extrairNomeDaDescricao(b.descricao));
      if (exigirNome && similaridade === 0) return;
      const minutos = minutosEntre(a, b);
      candidatos.push({ indiceA, indiceB, a, b, similaridade, minutos });
    });
  });

  // Melhor candidato primeiro (maior similaridade, depois menor diferença de
  // minutos) — em caso de empate total, mantém a ordem original (estável)
  // pra não introduzir aleatoriedade.
  candidatos.sort((x, y) =>
    y.similaridade - x.similaridade ||
    x.minutos - y.minutos ||
    x.indiceA - y.indiceA ||
    x.indiceB - y.indiceB
  );

  const usadosA = new Set();
  const usadosB = new Set();
  const pares = [];
  candidatos.forEach((c) => {
    if (usadosA.has(c.indiceA) || usadosB.has(c.indiceB)) return;
    usadosA.add(c.indiceA);
    usadosB.add(c.indiceB);
    pares.push({ a: c.a, b: c.b });
  });

  const semParA = listaA.filter((_, i) => !usadosA.has(i));
  const semParB = listaB.filter((_, i) => !usadosB.has(i));
  return { pares, semParA, semParB };
}
