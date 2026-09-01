import React from 'react';

// Uma classificação contábil combinada é guardada como uma única string
// "Nível1 > Nível2" nos campos "categoria" já existentes (contas_pagar,
// movimentacoes) — assim não precisamos mudar o schema dessas tabelas.
export function combinarCategoria(nivel1, nivel2) {
  if (!nivel1) return '';
  return nivel2 ? `${nivel1} > ${nivel2}` : nivel1;
}

export function separarCategoria(valorCombinado) {
  if (!valorCombinado) return { nivel1: '', nivel2: '' };
  const [nivel1, nivel2] = valorCombinado.split(' > ');
  return { nivel1: nivel1 || '', nivel2: nivel2 || '' };
}

// Dois <select> em cascata: escolhe o Nível 1, depois o Nível 2 filtrado
// pelas opções cadastradas para aquele Nível 1 (vindas da tabela
// categorias_contabeis, editável pelo usuário na aba Dashboard).
export default function CategoriaSelect({ categorias, value, onChange }) {
  const { nivel1, nivel2 } = separarCategoria(value);
  const niveis1 = [...new Set(categorias.map(c => c.nivel1))];
  const opcoesNivel2 = categorias.filter(c => c.nivel1 === nivel1).map(c => c.nivel2);

  return (
    <div className="categoria-select-duplo">
      <select
        value={nivel1}
        onChange={(e) => onChange(combinarCategoria(e.target.value, ''))}
      >
        <option value="">Nível 1...</option>
        {niveis1.map(n1 => <option key={n1} value={n1}>{n1}</option>)}
      </select>
      <select
        value={nivel2}
        onChange={(e) => onChange(combinarCategoria(nivel1, e.target.value))}
        disabled={!nivel1}
      >
        <option value="">Nível 2...</option>
        {opcoesNivel2.map(n2 => <option key={n2} value={n2}>{n2}</option>)}
      </select>
    </div>
  );
}
