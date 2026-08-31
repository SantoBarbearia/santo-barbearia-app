import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// Configuração Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializar Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [contas, setContas] = useState({
    caixa: 0,
    cofre: 0,
    reserva: 0,
    sicredi: 0
  });

  const [contasAPagar, setContasAPagar] = useState([
    { id: 1, data: '01/08/2026', descricao: 'Aluguel + IPTU', valor: 4414.05, vencimento: '13/08/2026', status: 'Aberto', conta: '' },
    { id: 2, data: '01/08/2026', descricao: 'Luz (Cemig)', valor: 131.65, vencimento: '11/08/2026', status: 'Aberto', conta: '' },
    { id: 3, data: '01/08/2026', descricao: 'Água (Copasa)', valor: 191.15, vencimento: '07/08/2026', status: 'Aberto', conta: '' },
    { id: 4, data: '01/08/2026', descricao: 'Telefone/Internet (Algar)', valor: 99.90, vencimento: '15/08/2026', status: 'Aberto', conta: '' },
    { id: 5, data: '01/08/2026', descricao: 'Spotify', valor: 40.90, vencimento: '01/08/2026', status: 'Aberto', conta: '' },
    { id: 6, data: '01/08/2026', descricao: 'Verisure (Alarme)', valor: 277.53, vencimento: '05/08/2026', status: 'Aberto', conta: '' },
    { id: 7, data: '01/08/2026', descricao: 'Honorários Contábeis', valor: 400.00, vencimento: '20/08/2026', status: 'Aberto', conta: '' }
  ]);

  const [comissoes, setComissoes] = useState({
    eduardo: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 },
    gabriel: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 },
    thais: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 },
    thiago: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 }
  });

  const [movimentacoes, setMovimentacoes] = useState([]);
  const [transferencia, setTransferencia] = useState({
    de: 'caixa',
    para: 'sicredi',
    valor: 0,
    data: new Date().toISOString().split('T')[0]
  });

  // Carregar dados do Supabase
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setCarregando(true);
      
      // Carregar contas
      const { data: contasData } = await supabase.from('contas').select('*').single();
      if (contasData) setContas(contasData);
      
      // Carregar contas a pagar
      const { data: contasPagarData } = await supabase.from('contas_pagar').select('*');
      if (contasPagarData) setContasAPagar(contasPagarData);
      
      // Carregar comissões
      const { data: comissoesData } = await supabase.from('comissoes').select('*').single();
      if (comissoesData) setComissoes(comissoesData);
      
      // Carregar movimentações
      const { data: movimentacoesData } = await supabase.from('movimentacoes').select('*');
      if (movimentacoesData) setMovimentacoes(movimentacoesData);
      
    } catch (erro) {
      console.error('Erro ao carregar dados:', erro);
      alert('Erro ao conectar com Supabase. Verifique suas credenciais!');
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  // Salvar dados no Supabase
  const salvarDados = async (dados) => {
    try {
      // Upsert contas (inserir ou atualizar)
      await supabase.from('contas').upsert([{ id: 1, ...dados.contas }]);
      
      // Delete e reinsert contas a pagar (mais simples que update individual)
      await supabase.from('contas_pagar').delete().neq('id', -1);
      if (dados.contasAPagar.length > 0) {
        await supabase.from('contas_pagar').insert(dados.contasAPagar);
      }
      
      // Upsert comissões
      await supabase.from('comissoes').upsert([{ id: 1, ...dados.comissoes }]);
      
      // Delete e reinsert movimentações
      await supabase.from('movimentacoes').delete().neq('id', -1);
      if (dados.movimentacoes.length > 0) {
        await supabase.from('movimentacoes').insert(dados.movimentacoes);
      }
    } catch (erro) {
      console.error('Erro ao salvar:', erro);
    }
  };

  const totalSaldo = Object.values(contas).reduce((a, b) => a + b, 0);
  const totalAPagar = contasAPagar.filter(c => c.status === 'Aberto').reduce((sum, c) => sum + c.valor, 0);

  const nomesContas = {
    caixa: 'Caixa',
    cofre: 'Cofre',
    reserva: 'Reserva/Investimento',
    sicredi: 'Conta Corrente (Sicredi)'
  };

  const handlePagarConta = (id, contaSelecionada) => {
    const conta = contasAPagar.find(c => c.id === id);
    if (!conta || !contaSelecionada) return;

    const novasContas = {
      ...contas,
      [contaSelecionada]: contas[contaSelecionada] - conta.valor
    };

    const novasContasAPagar = contasAPagar.map(c =>
      c.id === id ? { ...c, status: 'Pago', conta: contaSelecionada } : c
    );

    setContas(novasContas);
    setContasAPagar(novasContasAPagar);

    const novaMovimentacao = {
      id: Date.now(),
      data: new Date().toISOString().split('T')[0],
      tipo: 'Despesa Paga',
      descricao: conta.descricao,
      valor: conta.valor,
      conta: contaSelecionada
    };

    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];
    setMovimentacoes(novasMovimentacoes);

    salvarDados({
      contas: novasContas,
      contasAPagar: novasContasAPagar,
      comissoes,
      movimentacoes: novasMovimentacoes
    });
  };

  const handleTransferencia = () => {
    if (transferencia.valor <= 0 || transferencia.de === transferencia.para) return;

    const novasContas = {
      ...contas,
      [transferencia.de]: contas[transferencia.de] - parseFloat(transferencia.valor),
      [transferencia.para]: contas[transferencia.para] + parseFloat(transferencia.valor)
    };

    const novaMovimentacao = {
      id: Date.now(),
      data: transferencia.data,
      tipo: 'Transferência',
      descricao: `De ${nomesContas[transferencia.de]} para ${nomesContas[transferencia.para]}`,
      valor: parseFloat(transferencia.valor),
      de: transferencia.de,
      para: transferencia.para
    };

    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    setTransferencia({ ...transferencia, valor: 0 });

    salvarDados({
      contas: novasContas,
      contasAPagar,
      comissoes,
      movimentacoes: novasMovimentacoes
    });
  };

  const calcularComissao = (barb) => {
    const c = comissoes[barb];
    return (c.servicos + c.produtos + c.assinatura) - (c.vale + c.consumo + c.mei);
  };

  const barbeiros = [
    { chave: 'eduardo', nome: 'Eduardo Valverde' },
    { chave: 'gabriel', nome: 'Gabriel Evangelista' },
    { chave: 'thais', nome: 'Thais Moura' },
    { chave: 'thiago', nome: 'Thiago Môco' }
  ];

  if (loading) {
    return <div className="carregando">Carregando sistema...</div>;
  }

  if (carregando) {
    return <div className="carregando">Conectando ao banco de dados...</div>;
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>Santo Barbearia - Controle Financeiro</h1>
          <p className="subtitle">Agosto 2026</p>
        </header>

        <div className="cards-saldos">
          {Object.entries(contas).map(([chave, valor]) => (
            <div key={chave} className="card-saldo">
              <p className="label">{nomesContas[chave]}</p>
              <p className="valor">R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          ))}
          <div className="card-saldo total">
            <p className="label">TOTAL GERAL</p>
            <p className="valor">R$ {totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="tabs">
          {[
            { id: 'visao-geral', label: 'Visão Geral' },
            { id: 'contas-pagar', label: 'Contas a Pagar' },
            { id: 'comissoes', label: 'Comissões' },
            { id: 'transferencias', label: 'Transferências' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab ${activeTab === tab.id ? 'ativo' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="conteudo">
          {activeTab === 'visao-geral' && (
            <div>
              <div className="card">
                <h3>Resumo Financeiro</h3>
                <div className="resumo-grid">
                  <div className="resumo-item">
                    <p>Total a Pagar</p>
                    <p className="valor-resumo">R$ {totalAPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="resumo-item">
                    <p>Contas Abertas</p>
                    <p className="valor-resumo">{contasAPagar.filter(c => c.status === 'Aberto').length}</p>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3>Movimentações Recentes</h3>
                {movimentacoes.length === 0 ? (
                  <p>Nenhuma movimentação registrada</p>
                ) : (
                  <table className="tabela">
                    <tbody>
                      {movimentacoes.slice(-5).reverse().map((mov) => (
                        <tr key={mov.id}>
                          <td>{mov.data}</td>
                          <td>{mov.descricao}</td>
                          <td>R$ {mov.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'contas-pagar' && (
            <div className="card">
              <h3>Contas em Aberto</h3>
              {contasAPagar.filter(c => c.status === 'Aberto').map(conta => (
                <div key={conta.id} className="item-conta">
                  <div className="info-conta">
                    <p className="desc">{conta.descricao}</p>
                    <p className="venc">Vencimento: {conta.vencimento}</p>
                  </div>
                  <p className="valor-conta">R$ {conta.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <div className="acoes">
                    <select
                      value={conta.conta}
                      onChange={(e) => setContasAPagar(contasAPagar.map(c => c.id === conta.id ? { ...c, conta: e.target.value } : c))}
                    >
                      <option value="">Selecionar conta</option>
                      {Object.entries(nomesContas).map(([chave, nome]) => (
                        <option key={chave} value={chave}>{nome}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handlePagarConta(conta.id, conta.conta)}
                      disabled={!conta.conta || contas[conta.conta] < conta.valor}
                      className="btn-pagar"
                    >
                      Pagar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'comissoes' && (
            <div className="card">
              <h3>Cálculo de Comissões</h3>
              {barbeiros.map(barb => (
                <div key={barb.chave} className="comissao-card">
                  <h4>{barb.nome}</h4>
                  <div className="grid-comissao">
                    {['servicos', 'produtos', 'assinatura', 'vale', 'consumo'].map(campo => (
                      <div key={campo} className="input-group">
                        <label>{campo.charAt(0).toUpperCase() + campo.slice(1)}</label>
                        <input
                          type="number"
                          value={comissoes[barb.chave][campo]}
                          onChange={(e) => {
                            const novasComissoes = {
                              ...comissoes,
                              [barb.chave]: { ...comissoes[barb.chave], [campo]: parseFloat(e.target.value) || 0 }
                            };
                            setComissoes(novasComissoes);
                            salvarDados({ contas, contasAPagar, comissoes: novasComissoes, movimentacoes });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="total-comissao">
                    <span>Total Líquido:</span>
                    <span className="valor">R$ {calcularComissao(barb.chave).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'transferencias' && (
            <div className="card">
              <h3>Nova Transferência</h3>
              <div className="form-transferencia">
                <div className="input-group">
                  <label>De</label>
                  <select
                    value={transferencia.de}
                    onChange={(e) => setTransferencia({ ...transferencia, de: e.target.value })}
                  >
                    {Object.entries(nomesContas).map(([chave, nome]) => (
                      <option key={chave} value={chave}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Para</label>
                  <select
                    value={transferencia.para}
                    onChange={(e) => setTransferencia({ ...transferencia, para: e.target.value })}
                  >
                    {Object.entries(nomesContas).map(([chave, nome]) => (
                      <option key={chave} value={chave}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Valor</label>
                  <input
                    type="number"
                    value={transferencia.valor}
                    onChange={(e) => setTransferencia({ ...transferencia, valor: e.target.value })}
                  />
                </div>
                <button
                  onClick={handleTransferencia}
                  disabled={transferencia.valor <= 0 || transferencia.de === transferencia.para}
                  className="btn-transferir"
                >
                  Transferir
                </button>
              </div>

              {movimentacoes.filter(m => m.tipo === 'Transferência').length > 0 && (
                <div className="historico">
                  <h3>Histórico</h3>
                  <table className="tabela">
                    <tbody>
                      {movimentacoes.filter(m => m.tipo === 'Transferência').slice(-5).reverse().map((mov) => (
                        <tr key={mov.id}>
                          <td>{mov.data}</td>
                          <td>{nomesContas[mov.de]} → {nomesContas[mov.para]}</td>
                          <td>R$ {mov.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="footer">
          <p>💡 <strong>Dica:</strong> Todos os campos são editáveis. Os dados são salvos automaticamente no Supabase!</p>
        </div>
      </div>
    </div>
  );
}
