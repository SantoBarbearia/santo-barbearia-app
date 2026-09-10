// Conectivos que ficam minúsculos no meio do texto (mas maiúsculos se forem a
// primeira palavra) e siglas do dia a dia da barbearia que ficam sempre em
// caixa alta, mesmo em texto digitado em CAIXA ALTA ou minúsculo.
const CONECTIVOS_MINUSCULOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'a', 'o', 'as', 'os', 'no', 'na', 'nos', 'nas']);
const SIGLAS_MAIUSCULAS = new Set(['pix', 'cnpj', 'cpf', 'mei', 'pdf', 'csv', 'ofx', 'xlsx', 'mdr', 'rg', 'cep']);

// Corrige texto digitado em CAIXA ALTA (ou qualquer mistura) pra "Primeira
// Letra Maiúscula", já que a maior parte dos lançamentos é digitada assim.
export function capitalizarTexto(texto) {
  if (!texto) return texto;
  const palavras = texto.trim().split(/\s+/);
  return palavras
    .map((palavra, i) => {
      const minuscula = palavra.toLowerCase();
      if (SIGLAS_MAIUSCULAS.has(minuscula)) return minuscula.toUpperCase();
      if (i > 0 && CONECTIVOS_MINUSCULOS.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    })
    .join(' ');
}
