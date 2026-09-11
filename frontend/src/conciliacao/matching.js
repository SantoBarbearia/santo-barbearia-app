function diasEntre(dataIsoA, dataIsoB) {
  return Math.abs((new Date(dataIsoA) - new Date(dataIsoB)) / 86400000);
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

// Casa cada item de listaA com o melhor candidato em listaB: mesmo valor,
// dentro da tolerância de dias, priorizando quem tem o nome mais parecido
// (útil em Pix, onde o extrato e a comanda costumam trazer o nome de quem
// pagou) — sem isso, duas comandas de mesmo valor no mesmo dia podiam ser
// trocadas entre si só por causa da data. Quando nenhum dos dois lados tem
// nome reconhecível (ex: taxas de maquininha, contas a pagar), o
// desempate cai de volta pra data mais próxima, exatamente como antes.
// Retorna os pares batidos e o que sobrou sem correspondência de cada lado.
export function conciliar(listaA, listaB, toleranciaDias = 3) {
  const usadosB = new Set();
  const pares = [];
  const semParA = [];

  listaA.forEach((a) => {
    const nomeA = extrairNomeDaDescricao(a.descricao);
    let melhor = null;
    listaB.forEach((b) => {
      if (usadosB.has(b.id)) return;
      if (Math.abs(a.valor - b.valor) > 0.01) return;
      const dias = diasEntre(a.data, b.data);
      if (dias > toleranciaDias) return;
      const similaridade = similaridadeNomes(nomeA, extrairNomeDaDescricao(b.descricao));
      if (!melhor || similaridade > melhor.similaridade || (similaridade === melhor.similaridade && dias < melhor.dias)) {
        melhor = { b, dias, similaridade };
      }
    });
    if (melhor) {
      pares.push({ a, b: melhor.b });
      usadosB.add(melhor.b.id);
    } else {
      semParA.push(a);
    }
  });

  const semParB = listaB.filter((b) => !usadosB.has(b.id));
  return { pares, semParA, semParB };
}
