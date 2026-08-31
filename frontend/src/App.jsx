import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Conciliacao from './Conciliacao';
import Dashboard from './Dashboard';
import './App.css';

// Configuração Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializar Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

const CATEGORIAS_CONTABEIS = [
  'Receita de Serviços',
  'Receita de Produtos',
  'Outras Receitas',
  'Aluguel e Ocupação',
  'Água, Luz e Internet',
  'Salários e Comissões',
  'Impostos e Taxas',
  'Fornecedores e Produtos',
  'Taxas de Cartão/Maquininha',
  'Assinaturas e Sistemas',
  'Marketing e Publicidade',
  'Manutenção e Reparos',
  'Serviços Contábeis/Jurídicos',
  'Outras Despesas'
];

const BARBEIROS_CHAVES = ['eduardo', 'gabriel', 'thais', 'thiago'];
const CAMPOS_COMISSAO = ['servicos', 'produtos', 'assinatura', 'vale', 'consumo', 'mei'];

// A tabela "comissoes" no Supabase guarda uma coluna por barbeiro+campo
// (eduardo_servicos, eduardo_produtos, ...), mas o estado do app usa um
// objeto aninhado (comissoes.eduardo.servicos) — essas funções convertem
// entre os dois formatos na hora de salvar/carregar.
function achatarComissoes(comissoesAninhadas) {
  const achatado = {};
  BARBEIROS_CHAVES.forEach(b => {
    CAMPOS_COMISSAO.forEach(c => {
      achatado[`${b}_${c}`] = comissoesAninhadas[b]?.[c] ?? 0;
    });
  });
  return achatado;
}

function desachatarComissoes(linha) {
  const aninhado = {};
  BARBEIROS_CHAVES.forEach(b => {
    aninhado[b] = {};
    CAMPOS_COMISSAO.forEach(c => {
      aninhado[b][c] = parseFloat(linha[`${b}_${c}`]) || 0;
    });
  });
  return aninhado;
}

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
    { id: 1, data: '01/08/2026', descricao: 'Aluguel + IPTU', valor: 4414.05, vencimento: '13/08/2026', status: 'Aberto', conta: '', categoria: 'Aluguel e Ocupação', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 },
    { id: 2, data: '01/08/2026', descricao: 'Luz (Cemig)', valor: 131.65, vencimento: '11/08/2026', status: 'Aberto', conta: '', categoria: 'Água, Luz e Internet', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 },
    { id: 3, data: '01/08/2026', descricao: 'Água (Copasa)', valor: 191.15, vencimento: '07/08/2026', status: 'Aberto', conta: '', categoria: 'Água, Luz e Internet', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 },
    { id: 4, data: '01/08/2026', descricao: 'Telefone/Internet (Algar)', valor: 99.90, vencimento: '15/08/2026', status: 'Aberto', conta: '', categoria: 'Água, Luz e Internet', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 },
    { id: 5, data: '01/08/2026', descricao: 'Spotify', valor: 40.90, vencimento: '01/08/2026', status: 'Aberto', conta: '', categoria: 'Assinaturas e Sistemas', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 },
    { id: 6, data: '01/08/2026', descricao: 'Verisure (Alarme)', valor: 277.53, vencimento: '05/08/2026', status: 'Aberto', conta: '', categoria: 'Outras Despesas', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 },
    { id: 7, data: '01/08/2026', descricao: 'Honorários Contábeis', valor: 400.00, vencimento: '20/08/2026', status: 'Aberto', conta: '', categoria: 'Serviços Contábeis/Jurídicos', recorrente: false, grupoRecorrente: null, repeticoesRestantes: 0 }
  ]);

  const [comissoes, setComissoes] = useState({
    eduardo: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 },
    gabriel: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 },
    thais: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 },
    thiago: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 }
  });

  const [movimentacoes, setMovimentacoes] = useState([]);
  const [novaConta, setNovaConta] = useState({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '' });
  const [editandoContaId, setEditandoContaId] = useState(null);
  const [contaEditando, setContaEditando] = useState({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '' });
  const [transferencia, setTransferencia] = useState({
    de: 'caixa',
    para: 'sicredi',
    valor: 0,
    data: new Date().toISOString().split('T')[0]
  });
  const [ajuste, setAjuste] = useState({ conta: 'caixa', tipo: 'credito', valor: '', descricao: '', categoria: '' });
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [fechamentos, setFechamentos] = useState([]);
  const [notas, setNotas] = useState([]);

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
      if (comissoesData) setComissoes(desachatarComissoes(comissoesData));

      // Carregar movimentações
      const { data: movimentacoesData } = await supabase.from('movimentacoes').select('*');
      if (movimentacoesData) setMovimentacoes(movimentacoesData);

      // Carregar fechamentos mensais
      const { data: fechamentosData } = await supabase.from('fechamentos').select('*');
      if (fechamentosData) setFechamentos(fechamentosData);

      // Carregar observações do dashboard
      const { data: notasData } = await supabase.from('notas_dashboard').select('*');
      if (notasData) setNotas(notasData);

    } catch (erro) {
      console.error('Erro ao carregar dados:', erro);
      alert('Erro ao conectar com Supabase. Verifique suas credenciais!');
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  // Salvar dados no Supabase. Campos omitidos usam o valor atual do estado.
  const salvarDados = async (dadosParciais = {}) => {
    const dados = {
      contas, contasAPagar, comissoes, movimentacoes, fechamentos, notas,
      ...dadosParciais
    };
    try {
      // Upsert contas (inserir ou atualizar)
      await supabase.from('contas').upsert([{ id: 1, ...dados.contas }]);

      // Delete e reinsert contas a pagar (mais simples que update individual)
      await supabase.from('contas_pagar').delete().neq('id', -1);
      if (dados.contasAPagar.length > 0) {
        await supabase.from('contas_pagar').insert(dados.contasAPagar);
      }

      // Upsert comissões
      await supabase.from('comissoes').upsert([{ id: 1, ...achatarComissoes(dados.comissoes) }]);

      // Delete e reinsert movimentações
      await supabase.from('movimentacoes').delete().neq('id', -1);
      if (dados.movimentacoes.length > 0) {
        await supabase.from('movimentacoes').insert(dados.movimentacoes);
      }

      // Delete e reinsert fechamentos mensais
      await supabase.from('fechamentos').delete().neq('id', -1);
      if (dados.fechamentos.length > 0) {
        await supabase.from('fechamentos').insert(dados.fechamentos);
      }

      // Delete e reinsert observações do dashboard
      await supabase.from('notas_dashboard').delete().neq('id', -1);
      if (dados.notas.length > 0) {
        await supabase.from('notas_dashboard').insert(dados.notas);
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

  const dataBRparaISO = (dataBR) => {
    const [dia, mes, ano] = dataBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const dentroDoPeriodo = (dataBR) => {
    if (!periodoInicio && !periodoFim) return true;
    const iso = dataBRparaISO(dataBR);
    if (periodoInicio && iso < periodoInicio) return false;
    if (periodoFim && iso > periodoFim) return false;
    return true;
  };

  const contasAPagarFiltradas = contasAPagar.filter(c => dentroDoPeriodo(c.vencimento));

  const proximoVencimento = (dataBR) => {
    const [dia, mes, ano] = dataBR.split('/').map(Number);
    const d = new Date(ano, mes - 1 + 1, dia);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const handlePagarConta = (id, contaSelecionada) => {
    const conta = contasAPagar.find(c => c.id === id);
    if (!conta || !contaSelecionada) return;

    const novasContas = {
      ...contas,
      [contaSelecionada]: contas[contaSelecionada] - conta.valor
    };

    const agora = Date.now();

    let novasContasAPagar = contasAPagar.map(c =>
      c.id === id ? { ...c, status: 'Pago', conta: contaSelecionada } : c
    );

    if (conta.recorrente && conta.repeticoesRestantes > 0) {
      const outrasPagas = contasAPagar.filter(c =>
        c.grupoRecorrente === conta.grupoRecorrente && c.status === 'Pago' && c.id !== conta.id
      );
      const consideradas = [conta, ...outrasPagas]
        .sort((a, b) => new Date(dataBRparaISO(b.vencimento)) - new Date(dataBRparaISO(a.vencimento)))
        .slice(0, 3);
      const mediaValor = Math.round((consideradas.reduce((soma, c) => soma + c.valor, 0) / consideradas.length) * 100) / 100;

      const proximaConta = {
        id: agora,
        data: new Date().toLocaleDateString('pt-BR'),
        descricao: conta.descricao,
        valor: mediaValor,
        vencimento: proximoVencimento(conta.vencimento),
        status: 'Aberto',
        conta: '',
        categoria: conta.categoria,
        recorrente: true,
        grupoRecorrente: conta.grupoRecorrente,
        repeticoesRestantes: conta.repeticoesRestantes - 1
      };
      novasContasAPagar = [...novasContasAPagar, proximaConta];
    }

    setContas(novasContas);
    setContasAPagar(novasContasAPagar);

    const novaMovimentacao = {
      id: agora + 1,
      data: new Date().toISOString().split('T')[0],
      tipo: 'Despesa Paga',
      descricao: conta.descricao,
      valor: conta.valor,
      conta: contaSelecionada,
      contaPagarId: id,
      categoria: conta.categoria
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

  const handleAdicionarConta = () => {
    if (!novaConta.descricao.trim() || !(parseFloat(novaConta.valor) > 0) || !novaConta.vencimento) return;

    const [ano, mes, dia] = novaConta.vencimento.split('-');
    const id = Date.now();
    const recorrente = !!novaConta.recorrente;

    const conta = {
      id,
      data: new Date().toLocaleDateString('pt-BR'),
      descricao: novaConta.descricao.trim(),
      valor: parseFloat(novaConta.valor),
      vencimento: `${dia}/${mes}/${ano}`,
      status: 'Aberto',
      conta: '',
      categoria: novaConta.categoria,
      recorrente,
      grupoRecorrente: recorrente ? id : null,
      repeticoesRestantes: recorrente ? (parseInt(novaConta.repeticoes, 10) || 0) : 0
    };

    const novasContasAPagar = [...contasAPagar, conta];
    setContasAPagar(novasContasAPagar);
    setNovaConta({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '' });

    salvarDados({ contas, contasAPagar: novasContasAPagar, comissoes, movimentacoes });
  };

  const handleIniciarEdicaoConta = (conta) => {
    const [dia, mes, ano] = conta.vencimento.split('/');
    setEditandoContaId(conta.id);
    setContaEditando({
      descricao: conta.descricao,
      valor: conta.valor,
      vencimento: `${ano}-${mes}-${dia}`,
      categoria: conta.categoria || '',
      recorrente: !!conta.recorrente,
      repeticoes: conta.repeticoesRestantes || ''
    });
  };

  const handleCancelarEdicaoConta = () => {
    setEditandoContaId(null);
    setContaEditando({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '' });
  };

  const handleSalvarEdicaoConta = (id) => {
    if (!contaEditando.descricao.trim() || !(parseFloat(contaEditando.valor) > 0) || !contaEditando.vencimento) return;

    const [ano, mes, dia] = contaEditando.vencimento.split('-');
    const recorrente = !!contaEditando.recorrente;
    const novasContasAPagar = contasAPagar.map(c => c.id === id ? {
      ...c,
      descricao: contaEditando.descricao.trim(),
      valor: parseFloat(contaEditando.valor),
      vencimento: `${dia}/${mes}/${ano}`,
      categoria: contaEditando.categoria,
      recorrente,
      grupoRecorrente: recorrente ? (c.grupoRecorrente || c.id) : c.grupoRecorrente,
      repeticoesRestantes: recorrente ? (parseInt(contaEditando.repeticoes, 10) || 0) : 0
    } : c);

    setContasAPagar(novasContasAPagar);
    setEditandoContaId(null);
    setContaEditando({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '' });

    salvarDados({ contas, contasAPagar: novasContasAPagar, comissoes, movimentacoes });
  };

  const handleExcluirConta = (id) => {
    const conta = contasAPagar.find(c => c.id === id);
    if (!conta || !window.confirm(`Excluir "${conta.descricao}"? Essa ação não pode ser desfeita.`)) return;

    const novasContasAPagar = contasAPagar.filter(c => c.id !== id);
    setContasAPagar(novasContasAPagar);

    salvarDados({ contas, contasAPagar: novasContasAPagar, comissoes, movimentacoes });
  };

  const handleDesfazerPagamento = (id) => {
    const conta = contasAPagar.find(c => c.id === id);
    if (!conta || conta.status !== 'Pago') return;
    if (!window.confirm(`Desfazer o pagamento de "${conta.descricao}"? O valor volta para ${nomesContas[conta.conta]} e a conta volta para "Aberto".`)) return;

    const novasContas = { ...contas, [conta.conta]: contas[conta.conta] + conta.valor };
    const novasContasAPagar = contasAPagar.map(c => c.id === id ? { ...c, status: 'Aberto', conta: '' } : c);
    const novasMovimentacoes = movimentacoes.filter(m => !(m.tipo === 'Despesa Paga' && m.contaPagarId === id));

    setContas(novasContas);
    setContasAPagar(novasContasAPagar);
    setMovimentacoes(novasMovimentacoes);

    salvarDados({ contas: novasContas, contasAPagar: novasContasAPagar, comissoes, movimentacoes: novasMovimentacoes });
  };

  const handleExcluirTransferencia = (movId) => {
    const mov = movimentacoes.find(m => m.id === movId);
    if (!mov || !window.confirm('Excluir esta transferência? Os saldos das contas envolvidas serão revertidos.')) return;

    const novasContas = {
      ...contas,
      [mov.de]: contas[mov.de] + mov.valor,
      [mov.para]: contas[mov.para] - mov.valor
    };
    const novasMovimentacoes = movimentacoes.filter(m => m.id !== movId);

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);

    salvarDados({ contas: novasContas, contasAPagar, comissoes, movimentacoes: novasMovimentacoes });
  };

  const handleAjustarSaldo = () => {
    const valor = parseFloat(ajuste.valor);
    if (!(valor > 0)) return;

    const delta = ajuste.tipo === 'credito' ? valor : -valor;
    const novasContas = { ...contas, [ajuste.conta]: contas[ajuste.conta] + delta };

    const novaMovimentacao = {
      id: Date.now(),
      data: new Date().toLocaleDateString('pt-BR'),
      tipo: ajuste.tipo === 'credito' ? 'Crédito Manual' : 'Débito Manual',
      descricao: ajuste.descricao.trim() || (ajuste.tipo === 'credito' ? 'Crédito manual' : 'Débito manual'),
      valor,
      conta: ajuste.conta,
      categoria: ajuste.categoria
    };
    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    setAjuste({ ...ajuste, valor: '', descricao: '' });

    salvarDados({ contas: novasContas, contasAPagar, comissoes, movimentacoes: novasMovimentacoes });
  };

  const handleFecharMes = () => {
    const somar = (campo) => BARBEIROS_CHAVES.reduce((soma, b) => soma + (comissoes[b][campo] || 0), 0);
    const totalServicos = somar('servicos');
    const totalProdutos = somar('produtos');
    const totalAssinatura = somar('assinatura');
    const totalVale = somar('vale');
    const totalConsumo = somar('consumo');
    const totalMei = somar('mei');
    const comissaoBruta = totalServicos + totalProdutos + totalAssinatura;
    const comissaoLiquida = comissaoBruta - totalVale - totalConsumo - totalMei;

    const hoje = new Date();
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mesLabel = `${nomesMeses[hoje.getMonth()]}/${hoje.getFullYear()}`;

    if (!window.confirm(`Fechar ${mesLabel}? Isso salva uma foto das comissões atuais no histórico do Dashboard e zera os campos da aba Comissões pra um novo ciclo (o MEI volta para R$ 86,05).`)) return;

    const novoFechamento = {
      id: Date.now(),
      mes,
      mesLabel,
      faturamentoServicos: totalServicos,
      faturamentoProdutos: totalProdutos,
      faturamentoAssinatura: totalAssinatura,
      comissaoBruta,
      totalVale,
      totalConsumo,
      totalMei,
      comissaoLiquida,
      dataFechamento: hoje.toLocaleDateString('pt-BR')
    };
    const novosFechamentos = [...fechamentos, novoFechamento];

    const comissoesZeradas = {};
    BARBEIROS_CHAVES.forEach(b => {
      comissoesZeradas[b] = { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 86.05 };
    });

    setFechamentos(novosFechamentos);
    setComissoes(comissoesZeradas);

    salvarDados({ comissoes: comissoesZeradas, fechamentos: novosFechamentos });
  };

  const handleAdicionarNota = (texto) => {
    if (!texto.trim()) return;
    const novaNota = { id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), texto: texto.trim() };
    const novasNotas = [...notas, novaNota];
    setNotas(novasNotas);
    salvarDados({ notas: novasNotas });
  };

  const handleExcluirNota = (id) => {
    const novasNotas = notas.filter(n => n.id !== id);
    setNotas(novasNotas);
    salvarDados({ notas: novasNotas });
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
            { id: 'transferencias', label: 'Transferências' },
            { id: 'conciliacao', label: 'Conciliação' },
            { id: 'dashboard', label: 'Dashboard' }
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
                <h3>Adicionar Crédito/Débito em Conta</h3>
                <div className="form-transferencia">
                  <div className="input-group">
                    <label>Conta</label>
                    <select value={ajuste.conta} onChange={(e) => setAjuste({ ...ajuste, conta: e.target.value })}>
                      {Object.entries(nomesContas).map(([chave, nome]) => (
                        <option key={chave} value={chave}>{nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Tipo</label>
                    <select value={ajuste.tipo} onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value })}>
                      <option value="credito">Crédito (entrada)</option>
                      <option value="debito">Débito (saída)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Valor</label>
                    <input
                      type="number"
                      value={ajuste.valor}
                      onChange={(e) => setAjuste({ ...ajuste, valor: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="input-group">
                    <label>Descrição (opcional)</label>
                    <input
                      type="text"
                      value={ajuste.descricao}
                      onChange={(e) => setAjuste({ ...ajuste, descricao: e.target.value })}
                      placeholder="Ex: Vendas do dia"
                    />
                  </div>
                  <div className="input-group">
                    <label>Classificação Contábil</label>
                    <select value={ajuste.categoria} onChange={(e) => setAjuste({ ...ajuste, categoria: e.target.value })}>
                      <option value="">Selecionar...</option>
                      {CATEGORIAS_CONTABEIS.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAjustarSaldo}
                    disabled={!(parseFloat(ajuste.valor) > 0)}
                    className="btn-transferir"
                  >
                    Registrar
                  </button>
                </div>
              </div>

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
                          <td>{mov.descricao}{mov.categoria && <span className="badge-categoria"> {mov.categoria}</span>}</td>
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
            <div>
              <div className="card">
                <h3>Nova Conta a Pagar</h3>
                <div className="form-transferencia">
                  <div className="input-group">
                    <label>Descrição</label>
                    <input
                      type="text"
                      value={novaConta.descricao}
                      onChange={(e) => setNovaConta({ ...novaConta, descricao: e.target.value })}
                      placeholder="Ex: Aluguel"
                    />
                  </div>
                  <div className="input-group">
                    <label>Valor</label>
                    <input
                      type="number"
                      value={novaConta.valor}
                      onChange={(e) => setNovaConta({ ...novaConta, valor: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="input-group">
                    <label>Vencimento</label>
                    <input
                      type="date"
                      value={novaConta.vencimento}
                      onChange={(e) => setNovaConta({ ...novaConta, vencimento: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Classificação Contábil</label>
                    <select value={novaConta.categoria} onChange={(e) => setNovaConta({ ...novaConta, categoria: e.target.value })}>
                      <option value="">Selecionar...</option>
                      {CATEGORIAS_CONTABEIS.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={novaConta.recorrente}
                        onChange={(e) => setNovaConta({ ...novaConta, recorrente: e.target.checked })}
                      /> Conta recorrente
                    </label>
                    {novaConta.recorrente && (
                      <input
                        type="number"
                        min="1"
                        value={novaConta.repeticoes}
                        onChange={(e) => setNovaConta({ ...novaConta, repeticoes: e.target.value })}
                        placeholder="Repetir mais quantas vezes"
                      />
                    )}
                  </div>
                  <button
                    onClick={handleAdicionarConta}
                    disabled={!novaConta.descricao.trim() || !(parseFloat(novaConta.valor) > 0) || !novaConta.vencimento}
                    className="btn-transferir"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>Filtrar por Período (vencimento)</h3>
                <div className="form-transferencia">
                  <div className="input-group">
                    <label>De</label>
                    <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Até</label>
                    <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                  </div>
                  <button onClick={() => { setPeriodoInicio(''); setPeriodoFim(''); }} className="btn-cancelar">
                    Limpar filtro
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>Contas em Aberto</h3>
                {contasAPagarFiltradas.filter(c => c.status === 'Aberto').length === 0 && (
                  <p>Nenhuma conta em aberto {(periodoInicio || periodoFim) ? 'nesse período' : ''}</p>
                )}
                {contasAPagarFiltradas.filter(c => c.status === 'Aberto').map(conta => (
                  editandoContaId === conta.id ? (
                    <div key={conta.id} className="item-conta item-conta-editando">
                      <div className="form-transferencia">
                        <div className="input-group">
                          <label>Descrição</label>
                          <input
                            type="text"
                            value={contaEditando.descricao}
                            onChange={(e) => setContaEditando({ ...contaEditando, descricao: e.target.value })}
                          />
                        </div>
                        <div className="input-group">
                          <label>Valor</label>
                          <input
                            type="number"
                            value={contaEditando.valor}
                            onChange={(e) => setContaEditando({ ...contaEditando, valor: e.target.value })}
                          />
                        </div>
                        <div className="input-group">
                          <label>Vencimento</label>
                          <input
                            type="date"
                            value={contaEditando.vencimento}
                            onChange={(e) => setContaEditando({ ...contaEditando, vencimento: e.target.value })}
                          />
                        </div>
                        <div className="input-group">
                          <label>Classificação Contábil</label>
                          <select value={contaEditando.categoria} onChange={(e) => setContaEditando({ ...contaEditando, categoria: e.target.value })}>
                            <option value="">Selecionar...</option>
                            {CATEGORIAS_CONTABEIS.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div className="input-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={contaEditando.recorrente}
                              onChange={(e) => setContaEditando({ ...contaEditando, recorrente: e.target.checked })}
                            /> Conta recorrente
                          </label>
                          {contaEditando.recorrente && (
                            <input
                              type="number"
                              min="1"
                              value={contaEditando.repeticoes}
                              onChange={(e) => setContaEditando({ ...contaEditando, repeticoes: e.target.value })}
                              placeholder="Repetições restantes"
                            />
                          )}
                        </div>
                      </div>
                      <div className="acoes">
                        <button onClick={() => handleSalvarEdicaoConta(conta.id)} className="btn-salvar">Salvar</button>
                        <button onClick={handleCancelarEdicaoConta} className="btn-cancelar">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div key={conta.id} className="item-conta">
                      <div className="info-conta">
                        <p className="desc">
                          {conta.descricao}
                          {conta.recorrente && <span className="badge-recorrente"> 🔁 {conta.repeticoesRestantes}x restantes</span>}
                        </p>
                        <p className="venc">Vencimento: {conta.vencimento}</p>
                        {conta.categoria && <p className="badge-categoria">{conta.categoria}</p>}
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
                        <button onClick={() => handleIniciarEdicaoConta(conta)} className="btn-editar">Editar</button>
                        <button onClick={() => handleExcluirConta(conta.id)} className="btn-excluir">Excluir</button>
                      </div>
                    </div>
                  )
                ))}
              </div>

              {contasAPagarFiltradas.filter(c => c.status === 'Pago').length > 0 && (
                <div className="card">
                  <h3>Contas Pagas</h3>
                  <table className="tabela">
                    <tbody>
                      {contasAPagarFiltradas.filter(c => c.status === 'Pago').map(conta => (
                        <tr key={conta.id}>
                          <td>{conta.descricao}{conta.categoria && <span className="badge-categoria"> {conta.categoria}</span>}</td>
                          <td>R$ {conta.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>Pago com: {nomesContas[conta.conta] || '—'}</td>
                          <td>
                            <button onClick={() => handleDesfazerPagamento(conta.id)} className="btn-excluir">Desfazer</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                          <td>
                            <button onClick={() => handleExcluirTransferencia(mov.id)} className="btn-excluir">Excluir</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'conciliacao' && (
            <Conciliacao contasAPagar={contasAPagar} />
          )}

          {activeTab === 'dashboard' && (
            <Dashboard
              comissoes={comissoes}
              barbeiros={barbeiros}
              contasAPagar={contasAPagar}
              fechamentos={fechamentos}
              notas={notas}
              onFecharMes={handleFecharMes}
              onAdicionarNota={handleAdicionarNota}
              onExcluirNota={handleExcluirNota}
            />
          )}
        </div>

        <div className="footer">
          <p>💡 <strong>Dica:</strong> Todos os campos são editáveis. Os dados são salvos automaticamente no Supabase!</p>
        </div>
      </div>
    </div>
  );
}
