function diasEntre(dataIsoA, dataIsoB) {
  return Math.abs((new Date(dataIsoA) - new Date(dataIsoB)) / 86400000);
}

// Casa cada item de listaA com o melhor candidato (mesmo valor, data mais próxima) em listaB.
// Retorna os pares batidos e o que sobrou sem correspondência de cada lado.
export function conciliar(listaA, listaB, toleranciaDias = 3) {
  const usadosB = new Set();
  const pares = [];
  const semParA = [];

  listaA.forEach((a) => {
    let melhor = null;
    listaB.forEach((b) => {
      if (usadosB.has(b.id)) return;
      if (Math.abs(a.valor - b.valor) > 0.01) return;
      const dias = diasEntre(a.data, b.data);
      if (dias > toleranciaDias) return;
      if (!melhor || dias < melhor.dias) melhor = { b, dias };
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
