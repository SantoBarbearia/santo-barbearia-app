import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Conciliacao from './Conciliacao';
import Dashboard from './Dashboard';
import CategoriaSelect from './CategoriaSelect';
import GerenciarCategorias from './GerenciarCategorias';
import './App.css';

// Configuração Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializar Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

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
    eduardo: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 0 },
    gabriel: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 0 },
    thais: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 0 },
    thiago: { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 0 }
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
  const [categorias, setCategorias] = useState([]);
  const [editandoMovimentacaoId, setEditandoMovimentacaoId] = useState(null);
  const [movimentacaoEditando, setMovimentacaoEditando] = useState({ data: '', descricao: '', valor: '', categoria: '', conta: 'caixa' });

  const [vgPeriodoInicio, setVgPeriodoInicio] = useState('');
  const [vgPeriodoFim, setVgPeriodoFim] = useState('');
  const [vgTipoConta, setVgTipoConta] = useState('todas');
  const [mostrarDetalheAbertas, setMostrarDetalheAbertas] = useState(false);

  // Carregar dados do Supabase
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setCarregando(true);

      // Todas as tabelas são carregadas em paralelo (e não uma depois da
      // outra) — com 7 tabelas hoje, esperar cada uma terminar antes de
      // começar a próxima deixava o carregamento visivelmente mais lento.
      // Um limite de tempo evita que a tela de "Conectando..." fique presa
      // pra sempre se o Supabase estiver fora do ar (ex: projeto do plano
      // gratuito pausado por inatividade).
      const buscarDados = Promise.all([
        supabase.from('contas').select('*').single(),
        supabase.from('contas_pagar').select('*'),
        supabase.from('comissoes').select('*').single(),
        supabase.from('movimentacoes').select('*'),
        supabase.from('fechamentos').select('*'),
        supabase.from('notas_dashboard').select('*'),
        supabase.from('categorias_contabeis').select('*')
      ]);
      const semResposta = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('tempo esgotado')), 20000)
      );

      const [
        { data: contasData },
        { data: contasPagarData },
        { data: comissoesData },
        { data: movimentacoesData },
        { data: fechamentosData },
        { data: notasData },
        { data: categoriasData }
      ] = await Promise.race([buscarDados, semResposta]);

      if (contasData) setContas(contasData);
      if (contasPagarData) setContasAPagar(contasPagarData);
      if (comissoesData) setComissoes(desachatarComissoes(comissoesData));
      if (movimentacoesData) setMovimentacoes(movimentacoesData);
      if (fechamentosData) setFechamentos(fechamentosData);
      if (notasData) setNotas(notasData);
      if (categoriasData) setCategorias(categoriasData);

    } catch (erro) {
      console.error('Erro ao carregar dados:', erro);
      alert(
        'Não consegui conectar com o Supabase depois de 20 segundos.\n\n' +
        'A causa mais comum é o projeto do Supabase ter pausado por inatividade ' +
        '(acontece automaticamente no plano gratuito). Acesse supabase.com, entre no ' +
        'projeto e clique em "Restore project" se ele estiver marcado como pausado, ' +
        'depois recarregue esta página.'
      );
    } finally {
      setCarregando(false);
      setLoading(false);
    }
  };

  // Salvar dados no Supabase. Campos omitidos usam o valor atual do estado.
  //
  // Importante: supabase-js normalmente NÃO lança exceção quando uma consulta
  // falha (ex: banco fora do ar) — ele resolve normalmente com um campo
  // `error` preenchido. Por isso cada chamada abaixo é conferida na mão; sem
  // isso, um salvamento podia falhar de forma completamente silenciosa e o
  // usuário só descobria ao recarregar a página e ver tudo sumir.
  const salvarDados = async (dadosParciais = {}) => {
    const dados = {
      contas, contasAPagar, comissoes, movimentacoes, fechamentos, notas, categorias,
      ...dadosParciais
    };
    const erros = [];
    const verificar = (resultado, nomeTabela) => {
      if (resultado?.error) erros.push(`${nomeTabela} (${resultado.error.message})`);
    };

    try {
      const salvarTudo = (async () => {
        verificar(await supabase.from('contas').upsert([{ id: 1, ...dados.contas }]), 'contas');

        verificar(await supabase.from('contas_pagar').delete().neq('id', -1), 'contas a pagar');
        if (dados.contasAPagar.length > 0) {
          verificar(await supabase.from('contas_pagar').insert(dados.contasAPagar), 'contas a pagar');
        }

        verificar(await supabase.from('comissoes').upsert([{ id: 1, ...achatarComissoes(dados.comissoes) }]), 'comissões');

        verificar(await supabase.from('movimentacoes').delete().neq('id', -1), 'movimentações');
        if (dados.movimentacoes.length > 0) {
          verificar(await supabase.from('movimentacoes').insert(dados.movimentacoes), 'movimentações');
        }

        verificar(await supabase.from('fechamentos').delete().neq('id', -1), 'fechamentos');
        if (dados.fechamentos.length > 0) {
          verificar(await supabase.from('fechamentos').insert(dados.fechamentos), 'fechamentos');
        }

        verificar(await supabase.from('notas_dashboard').delete().neq('id', -1), 'observações');
        if (dados.notas.length > 0) {
          verificar(await supabase.from('notas_dashboard').insert(dados.notas), 'observações');
        }

        verificar(await supabase.from('categorias_contabeis').delete().neq('id', -1), 'classificações contábeis');
        if (dados.categorias.length > 0) {
          verificar(await supabase.from('categorias_contabeis').insert(dados.categorias), 'classificações contábeis');
        }
      })();

      const semResposta = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('tempo esgotado ao salvar')), 20000)
      );
      await Promise.race([salvarTudo, semResposta]);

      if (erros.length > 0) {
        throw new Error(erros.join(', '));
      }
    } catch (erro) {
      console.error('Erro ao salvar:', erro);
      alert(
        'ATENÇÃO: não consegui salvar essa alteração no banco de dados!\n\n' +
        'O que você acabou de fazer está aparecendo na tela, mas ainda NÃO foi salvo de verdade. ' +
        'Se você recarregar a página ou fechar o navegador agora, essa alteração vai se perder.\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Verifique sua internet e se o projeto do Supabase não está pausado (supabase.com → seu projeto → ' +
        '"Restore project" se aparecer pausado). Depois repita essa alteração.'
      );
    }
  };

  const totalSaldo = Object.values(contas).reduce((a, b) => a + b, 0);

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

  // A tabela movimentacoes tem datas guardadas em dois formatos diferentes
  // dependendo de onde foram criadas (ISO yyyy-mm-dd ou BR dd/mm/yyyy) —
  // esse helper normaliza os dois pra ISO antes de comparar com o filtro.
  const dataMovParaISO = (data) => {
    if (!data) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return dataBRparaISO(data);
    return data;
  };

  const dentroDoPeriodoVG = (dataISO) => {
    if (!vgPeriodoInicio && !vgPeriodoFim) return true;
    if (vgPeriodoInicio && dataISO < vgPeriodoInicio) return false;
    if (vgPeriodoFim && dataISO > vgPeriodoFim) return false;
    return true;
  };

  // Contas a Pagar dentro do período selecionado na Visão Geral (por vencimento)
  const contasAPagarVG = contasAPagar.filter(c => dentroDoPeriodoVG(dataBRparaISO(c.vencimento)));
  const abertasVG = contasAPagarVG.filter(c => c.status === 'Aberto');
  const totalAPagarVG = abertasVG.reduce((soma, c) => soma + c.valor, 0);

  // Movimentações dentro do período selecionado na Visão Geral
  const movimentacoesVG = movimentacoes.filter(m => dentroDoPeriodoVG(dataMovParaISO(m.data)));
  const movimentacoesVGporConta = movimentacoesVG.filter(m => {
    if (vgTipoConta === 'todas') return true;
    if (m.tipo === 'Transferência') return m.de === vgTipoConta || m.para === vgTipoConta;
    return m.conta === vgTipoConta;
  });

  // Saldo do período (entradas, saídas e saldo) por tipo de conta
  const contasParaSaldoVG = vgTipoConta === 'todas' ? Object.keys(nomesContas) : [vgTipoConta];
  const saldoPorContaVG = contasParaSaldoVG.map(chave => {
    let entradas = 0;
    let saidas = 0;
    movimentacoesVG.forEach(m => {
      if (m.tipo === 'Transferência') {
        if (m.de === chave) saidas += m.valor;
        if (m.para === chave) entradas += m.valor;
      } else if (m.conta === chave) {
        if (m.tipo === 'Despesa Paga' || m.tipo === 'Débito Manual') {
          saidas += m.valor;
        } else {
          entradas += m.valor;
        }
      }
    });
    return { chave, nome: nomesContas[chave], entradas, saidas, saldo: entradas - saidas };
  });

  // Classifica uma movimentação como entrada/saída/transferência pra exibição
  const tipoVisualMovimentacao = (mov) => {
    if (mov.tipo === 'Transferência') return 'transferencia';
    if (mov.tipo === 'Despesa Paga' || mov.tipo === 'Débito Manual') return 'saida';
    return 'entrada';
  };

  const isoParaBR = (iso) => {
    if (!iso) return '';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  // Gera uma planilha Excel com o resumo, as movimentações e as contas a pagar
  // do período/conta filtrados na Visão Geral, pra mandar pro contador.
  const handleExportarRelatorio = async () => {
    const XLSX = await import('xlsx');

    const periodoLabel = (vgPeriodoInicio || vgPeriodoFim)
      ? `${vgPeriodoInicio ? isoParaBR(vgPeriodoInicio) : 'início'} até ${vgPeriodoFim ? isoParaBR(vgPeriodoFim) : 'hoje'}`
      : 'Todo o período';

    const linhasResumo = [
      ['Santo Barbearia - Relatório Financeiro'],
      ['Período', periodoLabel],
      ['Tipo de Conta', vgTipoConta === 'todas' ? 'Todas' : nomesContas[vgTipoConta]],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      [],
      ['Total a Pagar (contas em aberto no período)', totalAPagarVG],
      ['Quantidade de Contas Abertas', abertasVG.length],
      [],
      ['Saldo do Período por Conta'],
      ['Conta', 'Entradas', 'Saídas', 'Saldo'],
      ...saldoPorContaVG.map(l => [l.nome, l.entradas, l.saidas, l.saldo])
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(linhasResumo);

    const linhasMov = [
      ['Data', 'Tipo', 'Descrição', 'Classificação Contábil', 'Conta', 'Valor'],
      ...movimentacoesVGporConta.map(m => [
        m.data,
        tipoVisualMovimentacao(m) === 'entrada' ? 'Entrada' : tipoVisualMovimentacao(m) === 'saida' ? 'Saída' : 'Transferência',
        m.descricao,
        m.categoria || '',
        m.tipo === 'Transferência' ? `${nomesContas[m.de]} → ${nomesContas[m.para]}` : (nomesContas[m.conta] || ''),
        m.valor
      ])
    ];
    const wsMov = XLSX.utils.aoa_to_sheet(linhasMov);

    const linhasContas = [
      ['Descrição', 'Classificação Contábil', 'Vencimento', 'Valor', 'Status', 'Paga com'],
      ...contasAPagarVG.map(c => [c.descricao, c.categoria || '', c.vencimento, c.valor, c.status, c.conta ? (nomesContas[c.conta] || '') : ''])
    ];
    const wsContas = XLSX.utils.aoa_to_sheet(linhasContas);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
    XLSX.utils.book_append_sheet(wb, wsMov, 'Movimentações');
    XLSX.utils.book_append_sheet(wb, wsContas, 'Contas a Pagar');

    const nomeArquivo = `relatorio-santo-barbearia-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  };

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

  // Corrige ou apaga um Crédito/Débito Manual (inclusive os lançados pela
  // Conciliação) — a única forma de arrumar um lançamento errado sem
  // desmontar o saldo da conta manualmente.
  const handleIniciarEdicaoMovimentacao = (mov) => {
    setEditandoMovimentacaoId(mov.id);
    setMovimentacaoEditando({
      data: dataMovParaISO(mov.data),
      descricao: mov.descricao,
      valor: mov.valor,
      categoria: mov.categoria || '',
      conta: mov.conta
    });
  };

  const handleCancelarEdicaoMovimentacao = () => {
    setEditandoMovimentacaoId(null);
    setMovimentacaoEditando({ data: '', descricao: '', valor: '', categoria: '', conta: 'caixa' });
  };

  const handleSalvarEdicaoMovimentacao = (id) => {
    const mov = movimentacoes.find(m => m.id === id);
    if (!mov || !(parseFloat(movimentacaoEditando.valor) > 0) || !movimentacaoEditando.descricao.trim() || !movimentacaoEditando.data) return;

    const valorNovo = parseFloat(movimentacaoEditando.valor);
    const contaNova = movimentacaoEditando.conta;
    const deltaAntigo = mov.tipo === 'Crédito Manual' ? mov.valor : -mov.valor;
    const deltaNovo = mov.tipo === 'Crédito Manual' ? valorNovo : -valorNovo;

    const novasContas = { ...contas };
    novasContas[mov.conta] -= deltaAntigo;
    novasContas[contaNova] = (novasContas[contaNova] ?? 0) + deltaNovo;

    const [ano, mes, dia] = movimentacaoEditando.data.split('-');
    const novasMovimentacoes = movimentacoes.map(m => m.id === id ? {
      ...m,
      data: `${dia}/${mes}/${ano}`,
      descricao: movimentacaoEditando.descricao.trim(),
      valor: valorNovo,
      categoria: movimentacaoEditando.categoria,
      conta: contaNova
    } : m);

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    setEditandoMovimentacaoId(null);
    setMovimentacaoEditando({ data: '', descricao: '', valor: '', categoria: '', conta: 'caixa' });

    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
  };

  const handleExcluirMovimentacaoManual = (id) => {
    const mov = movimentacoes.find(m => m.id === id);
    if (!mov || !window.confirm(`Excluir "${mov.descricao}"? O valor será revertido em ${nomesContas[mov.conta]}.`)) return;

    const delta = mov.tipo === 'Crédito Manual' ? -mov.valor : mov.valor;
    const novasContas = { ...contas, [mov.conta]: contas[mov.conta] + delta };
    const novasMovimentacoes = movimentacoes.filter(m => m.id !== id);

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);

    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
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

    if (!window.confirm(`Fechar ${mesLabel}? Isso salva uma foto das comissões atuais no histórico do Dashboard e zera todos os campos da aba Comissões (incluindo o MEI) pra um novo ciclo.`)) return;

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
      comissoesZeradas[b] = { servicos: 0, produtos: 0, assinatura: 0, vale: 0, consumo: 0, mei: 0 };
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

  const handleAdicionarCategoria = (nivel1, nivel2) => {
    if (!nivel1.trim() || !nivel2.trim()) return;
    const jaExiste = categorias.some(c => c.nivel1 === nivel1.trim() && c.nivel2 === nivel2.trim());
    if (jaExiste) return;
    const novaCategoria = { id: Date.now(), nivel1: nivel1.trim(), nivel2: nivel2.trim() };
    const novasCategorias = [...categorias, novaCategoria];
    setCategorias(novasCategorias);
    salvarDados({ categorias: novasCategorias });
  };

  const handleExcluirCategoria = (id) => {
    const novasCategorias = categorias.filter(c => c.id !== id);
    setCategorias(novasCategorias);
    salvarDados({ categorias: novasCategorias });
  };

  // Lança na Conta Corrente (Sicredi) um lançamento do extrato que a Conciliação
  // não achou em nenhuma outra fonte — vira uma movimentação real, atualizando o
  // saldo de verdade, não só uma comparação visual.
  const handleLancarDoExtrato = (linhaExtrato) => {
    const [ano, mes, dia] = linhaExtrato.data.split('-');
    const delta = linhaExtrato.tipo === 'entrada' ? linhaExtrato.valor : -linhaExtrato.valor;
    const novasContas = { ...contas, sicredi: contas.sicredi + delta };

    const novaMovimentacao = {
      id: Date.now(),
      data: `${dia}/${mes}/${ano}`,
      tipo: linhaExtrato.tipo === 'entrada' ? 'Crédito Manual' : 'Débito Manual',
      descricao: `${linhaExtrato.descricao} (lançado da Conciliação)`,
      valor: linhaExtrato.valor,
      conta: 'sicredi',
      categoria: linhaExtrato.categoria || ''
    };
    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
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
                    <CategoriaSelect
                      categorias={categorias}
                      value={ajuste.categoria}
                      onChange={(valor) => setAjuste({ ...ajuste, categoria: valor })}
                    />
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
                <h3>Filtrar Resumo por Período e Conta</h3>
                <div className="form-transferencia">
                  <div className="input-group">
                    <label>De</label>
                    <input type="date" value={vgPeriodoInicio} onChange={(e) => setVgPeriodoInicio(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Até</label>
                    <input type="date" value={vgPeriodoFim} onChange={(e) => setVgPeriodoFim(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Tipo de Conta</label>
                    <select value={vgTipoConta} onChange={(e) => setVgTipoConta(e.target.value)}>
                      <option value="todas">Todas</option>
                      {Object.entries(nomesContas).map(([chave, nome]) => (
                        <option key={chave} value={chave}>{nome}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => { setVgPeriodoInicio(''); setVgPeriodoFim(''); setVgTipoConta('todas'); }}
                    className="btn-cancelar"
                  >
                    Limpar filtro
                  </button>
                  <button onClick={handleExportarRelatorio} className="btn-transferir">
                    Exportar Relatório (Excel)
                  </button>
                </div>
                <p className="upload-dica">Gera uma planilha com o resumo, as movimentações e as contas a pagar do período/conta filtrados acima — pronta pra mandar pro contador.</p>
              </div>

              <div className="card">
                <h3>Resumo Financeiro {(vgPeriodoInicio || vgPeriodoFim) ? 'do Período' : ''}</h3>
                <div className="resumo-grid">
                  <div
                    className="resumo-item clicavel"
                    onClick={() => setMostrarDetalheAbertas(!mostrarDetalheAbertas)}
                  >
                    <p>Total a Pagar</p>
                    <p className="valor-resumo">R$ {totalAPagarVG.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="dica-clicar">clique para ver o detalhamento</p>
                  </div>
                  <div
                    className="resumo-item clicavel"
                    onClick={() => setMostrarDetalheAbertas(!mostrarDetalheAbertas)}
                  >
                    <p>Contas Abertas</p>
                    <p className="valor-resumo">{abertasVG.length}</p>
                    <p className="dica-clicar">clique para ver o detalhamento</p>
                  </div>
                </div>

                {mostrarDetalheAbertas && (
                  <div className="detalhe-lista">
                    {abertasVG.length === 0 ? (
                      <p>Nenhuma conta em aberto {(vgPeriodoInicio || vgPeriodoFim) ? 'nesse período' : ''}.</p>
                    ) : (
                      <table className="tabela">
                        <tbody>
                          {abertasVG.map(conta => (
                            <tr key={conta.id}>
                              <td>{conta.descricao}{conta.categoria && <span className="badge-categoria"> {conta.categoria}</span>}</td>
                              <td>Vencimento: {conta.vencimento}</td>
                              <td>R$ {conta.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              <div className="card">
                <h3>Saldo do Período por Tipo de Conta</h3>
                <table className="tabela-saldo-conta">
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Entradas</th>
                      <th>Saídas</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldoPorContaVG.map(linha => (
                      <tr key={linha.chave}>
                        <td>{linha.nome}</td>
                        <td className="valor-entrada">R$ {linha.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="valor-saida">R$ {linha.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>R$ {linha.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3>Movimentações Recentes {(vgPeriodoInicio || vgPeriodoFim || vgTipoConta !== 'todas') ? 'do Período/Conta Filtrados' : ''}</h3>
                {movimentacoesVGporConta.length === 0 ? (
                  <p>Nenhuma movimentação {(vgPeriodoInicio || vgPeriodoFim || vgTipoConta !== 'todas') ? 'nesse filtro' : 'registrada'}.</p>
                ) : (
                  <table className="tabela">
                    <tbody>
                      {movimentacoesVGporConta.slice(-8).reverse().map((mov) => {
                        const tipoVisual = tipoVisualMovimentacao(mov);
                        const editavel = mov.tipo === 'Crédito Manual' || mov.tipo === 'Débito Manual';

                        if (editandoMovimentacaoId === mov.id) {
                          return (
                            <tr key={mov.id}>
                              <td colSpan={4}>
                                <div className="form-transferencia" style={{ marginBottom: 10 }}>
                                  <div className="input-group">
                                    <label>Data</label>
                                    <input
                                      type="date"
                                      value={movimentacaoEditando.data}
                                      onChange={(e) => setMovimentacaoEditando({ ...movimentacaoEditando, data: e.target.value })}
                                    />
                                  </div>
                                  <div className="input-group">
                                    <label>Descrição</label>
                                    <input
                                      type="text"
                                      value={movimentacaoEditando.descricao}
                                      onChange={(e) => setMovimentacaoEditando({ ...movimentacaoEditando, descricao: e.target.value })}
                                    />
                                  </div>
                                  <div className="input-group">
                                    <label>Valor</label>
                                    <input
                                      type="number"
                                      value={movimentacaoEditando.valor}
                                      onChange={(e) => setMovimentacaoEditando({ ...movimentacaoEditando, valor: e.target.value })}
                                    />
                                  </div>
                                  <div className="input-group">
                                    <label>Conta</label>
                                    <select
                                      value={movimentacaoEditando.conta}
                                      onChange={(e) => setMovimentacaoEditando({ ...movimentacaoEditando, conta: e.target.value })}
                                    >
                                      {Object.entries(nomesContas).map(([chave, nome]) => (
                                        <option key={chave} value={chave}>{nome}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="input-group">
                                    <label>Classificação Contábil</label>
                                    <CategoriaSelect
                                      categorias={categorias}
                                      value={movimentacaoEditando.categoria}
                                      onChange={(valor) => setMovimentacaoEditando({ ...movimentacaoEditando, categoria: valor })}
                                    />
                                  </div>
                                </div>
                                <div className="acoes">
                                  <button onClick={() => handleSalvarEdicaoMovimentacao(mov.id)} className="btn-salvar">Salvar</button>
                                  <button onClick={handleCancelarEdicaoMovimentacao} className="btn-cancelar">Cancelar</button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={mov.id}>
                            <td>{mov.data}</td>
                            <td>
                              <span className={`badge-${tipoVisual}`}>
                                {tipoVisual === 'entrada' ? 'Entrada' : tipoVisual === 'saida' ? 'Saída' : 'Transferência'}
                              </span>
                              {mov.descricao}{mov.categoria && <span className="badge-categoria"> {mov.categoria}</span>}
                            </td>
                            <td>R$ {mov.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>
                              {editavel && (
                                <div className="acoes">
                                  <button onClick={() => handleIniciarEdicaoMovimentacao(mov)} className="btn-editar">Editar</button>
                                  <button onClick={() => handleExcluirMovimentacaoManual(mov.id)} className="btn-excluir">Excluir</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
                    <CategoriaSelect
                      categorias={categorias}
                      value={novaConta.categoria}
                      onChange={(valor) => setNovaConta({ ...novaConta, categoria: valor })}
                    />
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
                          <CategoriaSelect
                            categorias={categorias}
                            value={contaEditando.categoria}
                            onChange={(valor) => setContaEditando({ ...contaEditando, categoria: valor })}
                          />
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
                    {['servicos', 'produtos', 'assinatura', 'vale', 'consumo', 'mei'].map(campo => (
                      <div key={campo} className="input-group">
                        <label>{campo === 'mei' ? 'MEI (imposto mensal)' : campo.charAt(0).toUpperCase() + campo.slice(1)}</label>
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

          {/* Fica sempre montada (só escondida via CSS) pra não perder os arquivos
              carregados e o resultado da conciliação ao trocar de aba e voltar. */}
          <div style={{ display: activeTab === 'conciliacao' ? 'block' : 'none' }}>
            <Conciliacao
              contasAPagar={contasAPagar}
              movimentacoes={movimentacoes}
              categorias={categorias}
              onLancarMovimentacao={handleLancarDoExtrato}
            />
          </div>

          {activeTab === 'dashboard' && (
            <div>
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
              <GerenciarCategorias
                categorias={categorias}
                onAdicionar={handleAdicionarCategoria}
                onExcluir={handleExcluirCategoria}
              />
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
