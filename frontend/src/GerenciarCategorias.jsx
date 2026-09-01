import React, { useState } from 'react';

// Card para gerenciar as classificações contábeis (Nível 1 / Nível 2):
// adicionar novas combinações e excluir as que não fazem mais sentido.
export default function GerenciarCategorias({ categorias, onAdicionar, onExcluir }) {
  const [nivel1, setNivel1] = useState('');
  const [nivel2, setNivel2] = useState('');

  const niveis1Existentes = [...new Set(categorias.map(c => c.nivel1))];

  const grupos = niveis1Existentes.map(n1 => ({
    nivel1: n1,
    itens: categorias.filter(c => c.nivel1 === n1)
  }));

  const adicionar = () => {
    if (!nivel1.trim() || !nivel2.trim()) return;
    onAdicionar(nivel1.trim(), nivel2.trim());
    setNivel2('');
  };

  return (
    <div className="card">
      <h3>Classificações Contábeis</h3>
      <p className="nota-formato">
        Cadastre aqui as classificações usadas em Contas a Pagar, Ajustes de saldo e Conciliação.
        Cada classificação tem dois níveis, por exemplo: Nível 1 "Obrigações Tributárias" e Nível 2 "Simples Nacional".
      </p>
      <div className="form-transferencia">
        <div className="input-group">
          <label>Nível 1</label>
          <input
            type="text"
            list="niveis1-existentes"
            value={nivel1}
            onChange={(e) => setNivel1(e.target.value)}
            placeholder="Ex: Obrigações Tributárias"
          />
          <datalist id="niveis1-existentes">
            {niveis1Existentes.map(n1 => <option key={n1} value={n1} />)}
          </datalist>
        </div>
        <div className="input-group">
          <label>Nível 2</label>
          <input
            type="text"
            value={nivel2}
            onChange={(e) => setNivel2(e.target.value)}
            placeholder="Ex: Simples Nacional"
          />
        </div>
        <button
          onClick={adicionar}
          disabled={!nivel1.trim() || !nivel2.trim()}
          className="btn-transferir"
        >
          Adicionar
        </button>
      </div>

      {grupos.length === 0 ? (
        <p>Nenhuma classificação cadastrada ainda.</p>
      ) : (
        <div className="lista-categorias">
          {grupos.map(grupo => (
            <div key={grupo.nivel1} className="grupo-categoria">
              <h4>{grupo.nivel1}</h4>
              {grupo.itens.map(item => (
                <div key={item.id} className="item-categoria">
                  <span>{item.nivel2}</span>
                  <button onClick={() => onExcluir(item.id)} className="btn-excluir">Excluir</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
