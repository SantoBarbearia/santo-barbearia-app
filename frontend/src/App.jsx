import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Conciliacao from './Conciliacao';
import Dashboard from './Dashboard';
import CategoriaSelect, { separarCategoria } from './CategoriaSelect';
import GerenciarCategorias from './GerenciarCategorias';
import DadosEmpresa from './DadosEmpresa';
import { capitalizarTexto } from './utils/texto';
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

const DADOS_EMPRESA_VAZIO = {
  razaoSocial: '', cnpj: '', endereco: '', responsavelAdm: '',
  telefoneComercial: '', telefoneResponsavel: '', logo: null
};

// A tabela "dados_empresa" no Supabase usa snake_case (razao_social, ...);
// o estado do app usa camelCase — essas funções convertem entre os dois.
function paraEstadoDadosEmpresa(linha) {
  if (!linha) return DADOS_EMPRESA_VAZIO;
  return {
    razaoSocial: linha.razao_social || '',
    cnpj: linha.cnpj || '',
    endereco: linha.endereco || '',
    responsavelAdm: linha.responsavel_adm || '',
    telefoneComercial: linha.telefone_comercial || '',
    telefoneResponsavel: linha.telefone_responsavel || '',
    logo: linha.logo || null
  };
}

function paraLinhaDadosEmpresa(estado) {
  return {
    id: 1,
    razao_social: estado.razaoSocial || '',
    cnpj: estado.cnpj || '',
    endereco: estado.endereco || '',
    responsavel_adm: estado.responsavelAdm || '',
    telefone_comercial: estado.telefoneComercial || '',
    telefone_responsavel: estado.telefoneResponsavel || '',
    logo: estado.logo || null
  };
}

// Descobre a largura/altura reais de uma imagem (data URL) — usado pra
// desenhar a logo no PDF/Excel do tamanho certo, sem esticar ou distorcer.
function obterDimensoesImagem(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
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
  const [contaEditando, setContaEditando] = useState({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '', dataPagamento: '' });
  const [transferencia, setTransferencia] = useState({
    de: 'caixa',
    para: 'sicredi',
    valor: 0,
    data: new Date().toISOString().split('T')[0]
  });
  const [ajuste, setAjuste] = useState({ conta: 'caixa', tipo: 'credito', valor: '', descricao: '', categoria: '', data: new Date().toISOString().slice(0, 10) });
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [fechamentos, setFechamentos] = useState([]);
  const [notas, setNotas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [dadosEmpresa, setDadosEmpresa] = useState(DADOS_EMPRESA_VAZIO);
  const [faturamentoManual, setFaturamentoManual] = useState([]);
  const [projecaoParametros, setProjecaoParametros] = useState({ dataAumento: '', percentualAumento: 0, percentualCrescimento: 0 });
  const [pagamentosNaoIdentificados, setPagamentosNaoIdentificados] = useState([]);
  const [resgatesCashBarberPendentes, setResgatesCashBarberPendentes] = useState([]);
  const [resgatesCashBarberLancados, setResgatesCashBarberLancados] = useState([]);
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
        supabase.from('categorias_contabeis').select('*'),
        supabase.from('dados_empresa').select('*').single(),
        supabase.from('faturamento_manual').select('*'),
        supabase.from('parametros_projecao').select('*').single(),
        supabase.from('pagamentos_nao_identificados').select('*'),
        supabase.from('resgates_cashbarber_pendentes').select('*'),
        supabase.from('resgates_cashbarber_lancados').select('*')
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
        { data: categoriasData },
        { data: dadosEmpresaData },
        { data: faturamentoManualData },
        { data: projecaoParametrosData },
        { data: pagamentosNaoIdentificadosData },
        { data: resgatesCashBarberPendentesData },
        { data: resgatesCashBarberLancadosData }
      ] = await Promise.race([buscarDados, semResposta]);

      // Só os 4 saldos — a linha do Supabase também traz id/created_at/updated_at,
      // que não podem entrar no estado (os cartões de saldo renderizam todas as
      // chaves de `contas`, e uma data ali quebra a soma do Total Geral).
      if (contasData) {
        setContas({
          caixa: contasData.caixa,
          cofre: contasData.cofre,
          reserva: contasData.reserva,
          sicredi: contasData.sicredi
        });
      }
      if (contasPagarData) setContasAPagar(contasPagarData);
      if (comissoesData) setComissoes(desachatarComissoes(comissoesData));
      if (movimentacoesData) setMovimentacoes(movimentacoesData);
      if (fechamentosData) setFechamentos(fechamentosData);
      if (notasData) setNotas(notasData);
      if (categoriasData) setCategorias(categoriasData);
      if (dadosEmpresaData) setDadosEmpresa(paraEstadoDadosEmpresa(dadosEmpresaData));
      if (faturamentoManualData) {
        setFaturamentoManual(faturamentoManualData.map((l) => ({
          mes: l.mes,
          faturamentoProdutos: parseFloat(l.faturamento_produtos) || 0,
          faturamentoTotalManual: l.faturamento_total !== null && l.faturamento_total !== undefined ? parseFloat(l.faturamento_total) : null
        })));
      }
      if (projecaoParametrosData) {
        setProjecaoParametros({
          dataAumento: projecaoParametrosData.data_aumento || '',
          percentualAumento: parseFloat(projecaoParametrosData.percentual_aumento) || 0,
          percentualCrescimento: parseFloat(projecaoParametrosData.percentual_crescimento) || 0
        });
      }
      if (pagamentosNaoIdentificadosData) setPagamentosNaoIdentificados(pagamentosNaoIdentificadosData);
      if (resgatesCashBarberPendentesData) setResgatesCashBarberPendentes(resgatesCashBarberPendentesData);
      if (resgatesCashBarberLancadosData) setResgatesCashBarberLancados(resgatesCashBarberLancadosData);

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
        verificar(await supabase.from('contas_pagar').delete().neq('id', -1), 'contas a pagar');
        if (dados.contasAPagar.length > 0) {
          // dataPagamentoSelecionada é só um rascunho local (a data escolhida antes de
          // clicar em "Pagar") — nunca deve ir pro banco. Uma coluna que não existe na
          // tabela derruba o INSERT inteiro (e o DELETE acima já rodou, apagando tudo).
          const contasParaSalvar = dados.contasAPagar.map(({ dataPagamentoSelecionada, ...resto }) => resto);
          verificar(await supabase.from('contas_pagar').insert(contasParaSalvar), 'contas a pagar');
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

        // O saldo das contas só é salvo por último, e só se tudo mais acima deu
        // certo — se alguma tabela (principalmente movimentações) falhar no meio
        // do caminho, o saldo fica exatamente como estava antes, em vez de
        // "andar sozinho" sem a movimentação que explica a mudança (o que já
        // causou saldo fantasma quando uma tentativa anterior falhou por rede).
        if (erros.length === 0) {
          verificar(await supabase.from('contas').upsert([{ id: 1, ...dados.contas }]), 'contas');
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

  // O Supabase devolve colunas DATE sempre em ISO (yyyy-mm-dd), mesmo quando o
  // valor foi salvo como dd/mm/yyyy — então uma movimentação pode chegar em
  // qualquer um dos dois formatos dependendo de quando foi carregada. Aqui
  // sempre exibimos dd/mm/yyyy, do jeito que a Fernanda prefere.
  const formatarDataMovParaExibir = (data) => {
    const iso = dataMovParaISO(data);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return data || '';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  // Um clique errado no seletor nativo de data (ou o navegador confirmando o
  // campo antes da pessoa terminar de digitar o ano) pode deixar o filtro com
  // uma data tipo "0001-01-01" — sem essa proteção, isso vira um período que
  // literalmente começa "desde o início dos tempos", incluindo qualquer
  // resíduo antigo do saldo da conta que não devia aparecer em lugar nenhum.
  const anoValido = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && parseInt(iso.slice(0, 4), 10) >= 2000;
  const vgInicio = anoValido(vgPeriodoInicio) ? vgPeriodoInicio : '';
  const vgFim = anoValido(vgPeriodoFim) ? vgPeriodoFim : '';

  const dentroDoPeriodoVG = (dataISO) => {
    if (!vgInicio && !vgFim) return true;
    if (vgInicio && dataISO < vgInicio) return false;
    if (vgFim && dataISO > vgFim) return false;
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

  // Saldo da conta exatamente antes do período selecionado — "rebobina" o saldo
  // atual subtraindo o efeito de tudo que aconteceu a partir do início do
  // período (inclusive coisas com data depois do fim do período, se houver).
  const saldoAnteriorConta = (chave) => {
    let saldo = contas[chave] ?? 0;
    movimentacoes.forEach(m => {
      const dataISO = dataMovParaISO(m.data);
      if (!dataISO || dataISO < vgInicio) return;
      if (m.tipo === 'Transferência') {
        if (m.de === chave) saldo += m.valor;
        if (m.para === chave) saldo -= m.valor;
      } else if (m.conta === chave) {
        if (m.tipo === 'Despesa Paga' || m.tipo === 'Débito Manual') saldo += m.valor;
        else saldo -= m.valor;
      }
    });
    return saldo;
  };

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
    const saldoAnterior = saldoAnteriorConta(chave);
    return { chave, nome: nomesContas[chave], saldoAnterior, entradas, saidas, saldo: entradas - saidas, saldoFinal: saldoAnterior + (entradas - saidas) };
  });

  // Saldo de uma conta ao FINAL do período filtrado na Visão Geral (ou o saldo
  // atual de verdade, se nenhum período estiver filtrado) — independente do
  // filtro de "Tipo de Conta", pra poder mostrar as 4 contas nos cartões do
  // topo mesmo quando só uma delas está selecionada no filtro.
  const saldoNoFimDoPeriodo = (chave) => {
    if (!vgInicio && !vgFim) return contas[chave] ?? 0;
    let entradas = 0;
    let saidas = 0;
    movimentacoesVG.forEach(m => {
      if (m.tipo === 'Transferência') {
        if (m.de === chave) saidas += m.valor;
        if (m.para === chave) entradas += m.valor;
      } else if (m.conta === chave) {
        if (m.tipo === 'Despesa Paga' || m.tipo === 'Débito Manual') saidas += m.valor;
        else entradas += m.valor;
      }
    });
    return saldoAnteriorConta(chave) + (entradas - saidas);
  };

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
  // Formato "contábil" do Excel (símbolo de moeda alinhado à esquerda da
  // célula, valor à direita, negativos com sinal de menos antes do R$).
  const FORMATO_CONTABIL = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';

  // Monta os dados do relatório do jeito que Excel e PDF precisam — os dois
  // formatos mostram exatamente o mesmo conteúdo, só em layouts diferentes.
  const montarDadosRelatorio = () => {
    const periodoLabel = (vgInicio || vgFim)
      ? `${vgInicio ? isoParaBR(vgInicio) : 'início'} até ${vgFim ? isoParaBR(vgFim) : 'hoje'}`
      : 'Todo o período';

    const movimentacoesOrdenadas = [...movimentacoesVGporConta].sort((a, b) => dataMovParaISO(a.data).localeCompare(dataMovParaISO(b.data)) || a.id - b.id);

    // Agrupa por conta (na ordem do extrato: cronológica, do saldo anterior até
    // o final) em vez de misturar todas as contas juntas — só assim o saldo
    // parcial de cada linha faz sentido e dá pra achar exatamente onde bateu
    // errado, comparando linha a linha com o extrato do banco.
    const blocosPorConta = saldoPorContaVG.map((l) => {
      const movsDaConta = movimentacoesOrdenadas.filter((m) => (
        m.tipo === 'Transferência' ? (m.de === l.chave || m.para === l.chave) : m.conta === l.chave
      ));
      let saldoCorrente = l.saldoAnterior;
      const transacoes = movsDaConta.map((m) => {
        let valorComSinal;
        let tipoLabel;
        if (m.tipo === 'Transferência') {
          const saida = m.de === l.chave;
          valorComSinal = saida ? -m.valor : m.valor;
          tipoLabel = saida ? 'Saída (Transferência)' : 'Entrada (Transferência)';
        } else {
          const tipoVisual = tipoVisualMovimentacao(m);
          valorComSinal = tipoVisual === 'saida' ? -m.valor : m.valor;
          tipoLabel = tipoVisual === 'entrada' ? 'Entrada' : 'Saída';
        }
        saldoCorrente += valorComSinal;
        return {
          data: formatarDataMovParaExibir(m.data),
          tipo: tipoLabel,
          descricao: m.descricao,
          categoria: m.categoria || '',
          conta: m.tipo === 'Transferência' ? `${nomesContas[m.de]} → ${nomesContas[m.para]}` : (nomesContas[m.conta] || ''),
          valor: valorComSinal,
          saldoParcial: saldoCorrente
        };
      });
      return { nome: l.nome, saldoAnterior: l.saldoAnterior, saldoFinal: l.saldoFinal, transacoes };
    });

    // Resumo por Classificação Contábil — mesmo filtro de período/conta do
    // resto do relatório, pra facilitar o trabalho do contador (economiza
    // ele ter que somar linha por linha). Transferência entre contas próprias
    // fica de fora (não é Receita nem Despesa, é só dinheiro mudando de
    // lugar); um lançamento sem classificação ainda entra, agrupado em "Sem
    // Classificação", pra não escapar do resumo sem ela notar.
    const gruposClassificacao = new Map();
    movimentacoesVGporConta
      .filter((m) => m.tipo !== 'Transferência')
      .forEach((m) => {
        const { nivel1, nivel2 } = separarCategoria(m.categoria);
        const label = m.categoria || 'Sem Classificação';
        if (!gruposClassificacao.has(label)) {
          gruposClassificacao.set(label, { nivel1, nivel2, label, entradas: 0, saidas: 0 });
        }
        const grupo = gruposClassificacao.get(label);
        if (tipoVisualMovimentacao(m) === 'entrada') grupo.entradas += m.valor;
        else grupo.saidas += m.valor;
      });
    const resumoPorClassificacao = [...gruposClassificacao.values()]
      .map((g) => ({ ...g, total: g.entradas - g.saidas }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    // Faturamento e Comissões do período — igual o Resumo para Contabilidade
    // do Dashboard, mas somado pro período/conta filtrados aqui em vez de um
    // mês só. Faturamento Total vem das movimentações reais (mesma conta
    // "Receitas > Produtos e Serviços" do Resumo por Classificação acima);
    // a divisão Produtos/Serviços usa o valor de Produtos que ela digita mês
    // a mês no Dashboard (o Cash Barber não separa produto de serviço na
    // comanda), somando os meses que o período tocar.
    const faturamentoTotalPeriodo = movimentacoesVGporConta
      .filter((m) => {
        if (m.tipo === 'Transferência') return false;
        const { nivel1, nivel2 } = separarCategoria(m.categoria);
        return nivel1 === 'Receitas' && nivel2 === 'Produtos e Serviços' && tipoVisualMovimentacao(m) === 'entrada';
      })
      .reduce((s, m) => s + m.valor, 0);
    const mesInicioPeriodo = vgInicio ? vgInicio.slice(0, 7) : null;
    const mesFimPeriodo = vgFim ? vgFim.slice(0, 7) : null;
    const noPeriodo = (mes) => (!mesInicioPeriodo || mes >= mesInicioPeriodo) && (!mesFimPeriodo || mes <= mesFimPeriodo);
    const faturamentoProdutosPeriodo = faturamentoManual
      .filter((f) => noPeriodo(f.mes))
      .reduce((s, f) => s + (f.faturamentoProdutos || 0), 0);
    const faturamentoServicosPeriodo = faturamentoTotalPeriodo - faturamentoProdutosPeriodo;

    // Comissões só existem com data associada pros meses já FECHADOS (botão
    // "Fechar Ciclo de Comissões", tabela fechamentos) — o ciclo em
    // andamento é só um acumulado sem período, então fica de fora daqui (ver
    // nota no relatório).
    const fechamentosPeriodo = fechamentos.filter((f) => noPeriodo(f.mes));
    const comissaoBrutaPeriodo = fechamentosPeriodo.reduce((s, f) => s + (f.comissaoBruta || 0), 0);
    const comissaoLiquidaPeriodo = fechamentosPeriodo.reduce((s, f) => s + (f.comissaoLiquida || 0), 0);
    const totalValePeriodo = fechamentosPeriodo.reduce((s, f) => s + (f.totalVale || 0), 0);
    const totalConsumoPeriodo = fechamentosPeriodo.reduce((s, f) => s + (f.totalConsumo || 0), 0);
    const totalMeiPeriodo = fechamentosPeriodo.reduce((s, f) => s + (f.totalMei || 0), 0);

    return {
      periodoLabel,
      tipoContaLabel: vgTipoConta === 'todas' ? 'Todas' : nomesContas[vgTipoConta],
      geradoEm: new Date().toLocaleString('pt-BR'),
      totalAPagar: totalAPagarVG,
      qtdContasAbertas: abertasVG.length,
      saldoPorConta: saldoPorContaVG,
      totalSaldoFinal: saldoPorContaVG.reduce((s, l) => s + l.saldoFinal, 0),
      resumoPorClassificacao,
      faturamentoTotalPeriodo,
      faturamentoServicosPeriodo,
      faturamentoProdutosPeriodo,
      comissaoBrutaPeriodo,
      comissaoLiquidaPeriodo,
      totalValePeriodo,
      totalConsumoPeriodo,
      totalMeiPeriodo,
      blocosPorConta,
      contasAPagarLinhas: contasAPagarVG.map(c => ({
        descricao: c.descricao, categoria: c.categoria || '', vencimento: c.vencimento,
        valor: c.valor, status: c.status, pagaCom: c.conta ? (nomesContas[c.conta] || '') : ''
      }))
    };
  };

  // Linhas de texto com os dados cadastrados em "Dados da Empresa" — vazio
  // quando ela ainda não preencheu nada, pra não aparecer "CNPJ: " sem valor.
  const linhasCabecalhoEmpresa = () => ([
    dadosEmpresa.razaoSocial,
    dadosEmpresa.cnpj ? `CNPJ: ${dadosEmpresa.cnpj}` : '',
    dadosEmpresa.endereco,
    dadosEmpresa.responsavelAdm ? `Responsável Adm.: ${dadosEmpresa.responsavelAdm}` : '',
    dadosEmpresa.telefoneComercial ? `Tel. Comercial: ${dadosEmpresa.telefoneComercial}` : '',
    dadosEmpresa.telefoneResponsavel ? `Tel. Responsável: ${dadosEmpresa.telefoneResponsavel}` : ''
  ].filter(Boolean));

  const baixarArquivo = (blob, nomeArquivo) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportarRelatorio = async () => {
    const dadosRel = montarDadosRelatorio();
    const cabecalhoEmpresa = linhasCabecalhoEmpresa();
    const dimensoesLogo = dadosEmpresa.logo ? await obterDimensoesImagem(dadosEmpresa.logo).catch(() => null) : null;

    const workbook = new ExcelJS.Workbook();

    // Escreve célula a célula com um cursor de linha manual (em vez de
    // aoa_to_sheet) pra poder empurrar o conteúdo pra baixo quando tem
    // logo/dados da empresa pra caber em cima, sem bagunçar o resto.
    const escreverCabecalhoEmpresa = (worksheet, colunaTexto) => {
      if (dadosEmpresa.logo && dimensoesLogo) {
        const extensaoMatch = dadosEmpresa.logo.match(/^data:image\/(\w+);/);
        let extensao = (extensaoMatch?.[1] || 'png').toLowerCase();
        if (extensao === 'jpg') extensao = 'jpeg';
        if (!['png', 'jpeg', 'gif'].includes(extensao)) extensao = 'png';
        const imageId = workbook.addImage({ base64: dadosEmpresa.logo, extension: extensao });
        const ALTURA_MAX_PX = 80;
        const escala = Math.min(1, ALTURA_MAX_PX / dimensoesLogo.altura);
        worksheet.addImage(imageId, {
          tl: { col: 0, row: 0 },
          ext: { width: dimensoesLogo.largura * escala, height: dimensoesLogo.altura * escala }
        });
      }
      cabecalhoEmpresa.forEach((texto, i) => {
        worksheet.getCell(i + 1, colunaTexto).value = texto;
      });
      if (cabecalhoEmpresa[0]) worksheet.getCell(1, colunaTexto).font = { bold: true, size: 13 };
      const temCabecalho = dadosEmpresa.logo || cabecalhoEmpresa.length > 0;
      return temCabecalho ? Math.max(cabecalhoEmpresa.length, dadosEmpresa.logo ? 5 : 0) + 2 : 1;
    };

    // --- Aba Resumo ---
    const wsResumo = workbook.addWorksheet('Resumo');
    wsResumo.columns = [{ width: 38 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 18 }, { width: 16 }];
    let r = escreverCabecalhoEmpresa(wsResumo, 4);

    const linha = (valores, colunasMoeda = []) => {
      valores.forEach((v, i) => { wsResumo.getCell(r, i + 1).value = v; });
      colunasMoeda.forEach((c) => { wsResumo.getCell(r, c).numFmt = FORMATO_CONTABIL; });
      r++;
    };
    wsResumo.getCell(r, 1).value = 'Santo Barbearia - Relatório Financeiro';
    wsResumo.getCell(r, 1).font = { bold: true, size: 14 };
    r++;
    linha(['Período', dadosRel.periodoLabel]);
    linha(['Tipo de Conta', dadosRel.tipoContaLabel]);
    linha(['Gerado em', dadosRel.geradoEm]);
    r++;
    linha(['Total a Pagar (contas em aberto no período)', dadosRel.totalAPagar], [2]);
    linha(['Quantidade de Contas Abertas', dadosRel.qtdContasAbertas]);
    r++;
    wsResumo.getCell(r, 1).value = 'Saldo do Período por Conta';
    wsResumo.getCell(r, 1).font = { bold: true };
    r++;
    linha(['Conta', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo do Período', 'Saldo Final']);
    wsResumo.getRow(r - 1).font = { bold: true };
    dadosRel.saldoPorConta.forEach((l) => linha([l.nome, l.saldoAnterior, l.entradas, -l.saidas, l.saldo, l.saldoFinal], [2, 3, 4, 5, 6]));
    linha([
      'Total',
      dadosRel.saldoPorConta.reduce((s, l) => s + l.saldoAnterior, 0),
      dadosRel.saldoPorConta.reduce((s, l) => s + l.entradas, 0),
      -dadosRel.saldoPorConta.reduce((s, l) => s + l.saidas, 0),
      dadosRel.saldoPorConta.reduce((s, l) => s + l.saldo, 0),
      dadosRel.totalSaldoFinal
    ], [2, 3, 4, 5, 6]);
    r++;
    wsResumo.getCell(r, 1).value = 'Resumo do Período por Classificação Contábil';
    wsResumo.getCell(r, 1).font = { bold: true };
    r++;
    linha(['Classificação Contábil', 'Entradas', 'Saídas', 'Total']);
    wsResumo.getRow(r - 1).font = { bold: true };
    dadosRel.resumoPorClassificacao.forEach((c) => linha([c.label, c.entradas, -c.saidas, c.total], [2, 3, 4]));
    linha([
      'Total',
      dadosRel.resumoPorClassificacao.reduce((s, c) => s + c.entradas, 0),
      -dadosRel.resumoPorClassificacao.reduce((s, c) => s + c.saidas, 0),
      dadosRel.resumoPorClassificacao.reduce((s, c) => s + c.total, 0)
    ], [2, 3, 4]);
    r++;
    wsResumo.getCell(r, 1).value = 'Faturamento e Comissões do Período';
    wsResumo.getCell(r, 1).font = { bold: true };
    r++;
    linha(['Faturamento Total (Produtos + Serviços)', dadosRel.faturamentoTotalPeriodo], [2]);
    linha(['   Faturamento de Serviços', dadosRel.faturamentoServicosPeriodo], [2]);
    linha(['   Faturamento de Produtos', dadosRel.faturamentoProdutosPeriodo], [2]);
    r++;
    linha(['Comissão Bruta dos Barbeiros', dadosRel.comissaoBrutaPeriodo], [2]);
    linha(['   (-) Vale', dadosRel.totalValePeriodo], [2]);
    linha(['   (-) Consumo', dadosRel.totalConsumoPeriodo], [2]);
    linha(['   (-) MEI', dadosRel.totalMeiPeriodo], [2]);
    linha(['Comissão Líquida dos Barbeiros', dadosRel.comissaoLiquidaPeriodo], [2]);
    wsResumo.getCell(r, 1).value = 'Obs: Comissões somam só os meses já fechados no período (Dashboard > Comissões > "Fechar Ciclo de Comissões") — o ciclo em andamento não entra, porque não tem uma data associada.';
    wsResumo.getCell(r, 1).font = { italic: true, size: 9 };
    r++;

    // --- Aba Movimentações ---
    const wsMov = workbook.addWorksheet('Movimentações');
    wsMov.columns = [{ width: 12 }, { width: 20 }, { width: 40 }, { width: 26 }, { width: 22 }, { width: 16 }, { width: 16 }];
    let rMov = escreverCabecalhoEmpresa(wsMov, 4);
    const linhaMov = (valores, colunasMoeda = []) => {
      valores.forEach((v, i) => { wsMov.getCell(rMov, i + 1).value = v; });
      colunasMoeda.forEach((c) => { wsMov.getCell(rMov, c).numFmt = FORMATO_CONTABIL; });
      rMov++;
    };
    linhaMov(['Data', 'Tipo', 'Descrição', 'Classificação Contábil', 'Conta', 'Valor', 'Saldo Parcial']);
    wsMov.getRow(rMov - 1).font = { bold: true };
    dadosRel.blocosPorConta.forEach((bloco) => {
      linhaMov(['', '', '', 'Saldo Anterior', bloco.nome, bloco.saldoAnterior, bloco.saldoAnterior], [6, 7]);
      bloco.transacoes.forEach((t) => linhaMov([t.data, t.tipo, t.descricao, t.categoria, t.conta, t.valor, t.saldoParcial], [6, 7]));
      linhaMov(['', '', '', 'Saldo Final', bloco.nome, bloco.saldoFinal, bloco.saldoFinal], [6, 7]);
      linhaMov(['', '', '', '', '', '', '']);
    });
    linhaMov(['', '', '', '', 'Total Geral', dadosRel.totalSaldoFinal, ''], [6]);

    // --- Aba Contas a Pagar ---
    const wsContas = workbook.addWorksheet('Contas a Pagar');
    wsContas.columns = [{ width: 40 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 22 }];
    let rContas = escreverCabecalhoEmpresa(wsContas, 4);
    const linhaContas = (valores, colunasMoeda = []) => {
      valores.forEach((v, i) => { wsContas.getCell(rContas, i + 1).value = v; });
      colunasMoeda.forEach((c) => { wsContas.getCell(rContas, c).numFmt = FORMATO_CONTABIL; });
      rContas++;
    };
    linhaContas(['Descrição', 'Classificação Contábil', 'Vencimento', 'Valor', 'Status', 'Paga com']);
    wsContas.getRow(rContas - 1).font = { bold: true };
    dadosRel.contasAPagarLinhas.forEach((c) => linhaContas([c.descricao, c.categoria, c.vencimento, c.valor, c.status, c.pagaCom], [4]));

    const buffer = await workbook.xlsx.writeBuffer();
    const nomeArquivo = `relatorio-santo-barbearia-${new Date().toISOString().slice(0, 10)}.xlsx`;
    baixarArquivo(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArquivo);
  };

  const handleExportarRelatorioPDF = async () => {
    const dadosRel = montarDadosRelatorio();
    const cabecalhoEmpresa = linhasCabecalhoEmpresa();
    const dimensoesLogo = dadosEmpresa.logo ? await obterDimensoesImagem(dadosEmpresa.logo).catch(() => null) : null;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const MARGEM = 14;
    const LARGURA_PAGINA = doc.internal.pageSize.getWidth();
    const ALTURA_PAGINA = doc.internal.pageSize.getHeight();
    const formatarMoedaPDF = (v) => `${v < 0 ? '-' : ''}R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // --- Cabeçalho (logo + dados da empresa) ---
    let xTexto = MARGEM;
    let yLinhaEmpresa = MARGEM + 4;
    if (dadosEmpresa.logo && dimensoesLogo) {
      const ALTURA_MAX_MM = 20;
      const LARGURA_MAX_MM = 45;
      const escala = Math.min(LARGURA_MAX_MM / dimensoesLogo.largura, ALTURA_MAX_MM / dimensoesLogo.altura, 1);
      const larguraLogo = dimensoesLogo.largura * escala;
      const alturaLogo = dimensoesLogo.altura * escala;
      const extensaoMatch = dadosEmpresa.logo.match(/^data:image\/(\w+);/);
      let formato = (extensaoMatch?.[1] || 'png').toUpperCase();
      if (formato === 'JPG') formato = 'JPEG';
      try {
        doc.addImage(dadosEmpresa.logo, formato, MARGEM, MARGEM, larguraLogo, alturaLogo);
        xTexto = MARGEM + larguraLogo + 6;
      } catch (e) {
        console.error('Não foi possível desenhar a logo no PDF:', e);
      }
    }
    if (cabecalhoEmpresa.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(12);
      doc.text(cabecalhoEmpresa[0], xTexto, yLinhaEmpresa);
      yLinhaEmpresa += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90);
      cabecalhoEmpresa.slice(1).forEach((texto) => {
        doc.text(texto, xTexto, yLinhaEmpresa);
        yLinhaEmpresa += 4;
      });
      doc.setTextColor(0);
    }

    let y = Math.max(yLinhaEmpresa + 4, MARGEM + (dadosEmpresa.logo ? 24 : 0) + 6);
    doc.setDrawColor(9, 74, 0);
    doc.setLineWidth(0.6);
    doc.line(MARGEM, y, LARGURA_PAGINA - MARGEM, y);
    y += 8;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(15);
    doc.text('Relatório Financeiro', MARGEM, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(`Período: ${dadosRel.periodoLabel}`, MARGEM, y);
    doc.text(`Tipo de Conta: ${dadosRel.tipoContaLabel}`, LARGURA_PAGINA / 2, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Gerado em ${dadosRel.geradoEm}`, MARGEM, y);
    doc.setTextColor(0);
    y += 8;

    const garantirEspaco = (alturaNecessaria) => {
      if (y + alturaNecessaria > ALTURA_PAGINA - MARGEM) {
        doc.addPage();
        y = MARGEM;
      }
    };

    // --- Resumo ---
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    garantirEspaco(10);
    doc.text('Resumo', MARGEM, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM },
      styles: { fontSize: 9 },
      theme: 'plain',
      body: [
        ['Total a Pagar (contas em aberto no período)', formatarMoedaPDF(dadosRel.totalAPagar)],
        ['Quantidade de Contas Abertas', String(dadosRel.qtdContasAbertas)]
      ]
    });
    y = doc.lastAutoTable.finalY + 4;

    garantirEspaco(20);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM },
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [9, 74, 0] },
      head: [['Conta', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo do Período', 'Saldo Final']],
      body: [
        ...dadosRel.saldoPorConta.map(l => [l.nome, formatarMoedaPDF(l.saldoAnterior), formatarMoedaPDF(l.entradas), formatarMoedaPDF(-l.saidas), formatarMoedaPDF(l.saldo), formatarMoedaPDF(l.saldoFinal)]),
        [
          { content: 'Total', styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(dadosRel.saldoPorConta.reduce((s, l) => s + l.saldoAnterior, 0)), styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(dadosRel.saldoPorConta.reduce((s, l) => s + l.entradas, 0)), styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(-dadosRel.saldoPorConta.reduce((s, l) => s + l.saidas, 0)), styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(dadosRel.saldoPorConta.reduce((s, l) => s + l.saldo, 0)), styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(dadosRel.totalSaldoFinal), styles: { fontStyle: 'bold' } }
        ]
      ]
    });
    y = doc.lastAutoTable.finalY + 10;

    // --- Resumo por Classificação Contábil ---
    garantirEspaco(20);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Resumo do Período por Classificação Contábil', MARGEM, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM },
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [9, 74, 0] },
      head: [['Classificação Contábil', 'Entradas', 'Saídas', 'Total']],
      body: [
        ...dadosRel.resumoPorClassificacao.map(c => [c.label, formatarMoedaPDF(c.entradas), formatarMoedaPDF(-c.saidas), formatarMoedaPDF(c.total)]),
        [
          { content: 'Total', styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(dadosRel.resumoPorClassificacao.reduce((s, c) => s + c.entradas, 0)), styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(-dadosRel.resumoPorClassificacao.reduce((s, c) => s + c.saidas, 0)), styles: { fontStyle: 'bold' } },
          { content: formatarMoedaPDF(dadosRel.resumoPorClassificacao.reduce((s, c) => s + c.total, 0)), styles: { fontStyle: 'bold' } }
        ]
      ]
    });
    y = doc.lastAutoTable.finalY + 10;

    // --- Faturamento e Comissões do Período ---
    garantirEspaco(30);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Faturamento e Comissões do Período', MARGEM, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM },
      styles: { fontSize: 9 },
      theme: 'plain',
      body: [
        [{ content: 'Faturamento Total (Produtos + Serviços)', styles: { fontStyle: 'bold' } }, { content: formatarMoedaPDF(dadosRel.faturamentoTotalPeriodo), styles: { fontStyle: 'bold' } }],
        ['   Faturamento de Serviços', formatarMoedaPDF(dadosRel.faturamentoServicosPeriodo)],
        ['   Faturamento de Produtos', formatarMoedaPDF(dadosRel.faturamentoProdutosPeriodo)],
        [{ content: 'Comissão Bruta dos Barbeiros', styles: { fontStyle: 'bold' } }, { content: formatarMoedaPDF(dadosRel.comissaoBrutaPeriodo), styles: { fontStyle: 'bold' } }],
        ['   (-) Vale', formatarMoedaPDF(dadosRel.totalValePeriodo)],
        ['   (-) Consumo', formatarMoedaPDF(dadosRel.totalConsumoPeriodo)],
        ['   (-) MEI', formatarMoedaPDF(dadosRel.totalMeiPeriodo)],
        [{ content: 'Comissão Líquida dos Barbeiros', styles: { fontStyle: 'bold' } }, { content: formatarMoedaPDF(dadosRel.comissaoLiquidaPeriodo), styles: { fontStyle: 'bold' } }]
      ]
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setFont(undefined, 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      'Obs: Comissões somam só os meses já fechados no período (Dashboard > Comissões > "Fechar Ciclo de Comissões") — o ciclo em andamento não entra, porque não tem uma data associada.',
      MARGEM, y, { maxWidth: LARGURA_PAGINA - 2 * MARGEM }
    );
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');
    y += 12;

    // --- Movimentações (uma tabela por conta, igual ao Excel) ---
    garantirEspaco(14);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Movimentações', MARGEM, y);
    y += 6;

    dadosRel.blocosPorConta.forEach((bloco) => {
      if (bloco.transacoes.length === 0) return;
      garantirEspaco(16);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9.5);
      doc.text(bloco.nome, MARGEM, y);
      y += 4;

      const corSaldo = [230, 240, 226];
      autoTable(doc, {
        startY: y,
        margin: { left: MARGEM, right: MARGEM },
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [9, 74, 0] },
        head: [['Data', 'Tipo', 'Descrição', 'Classificação Contábil', 'Conta', 'Valor', 'Saldo Parcial']],
        body: [
          [
            { content: '', styles: { fillColor: corSaldo } }, { content: '', styles: { fillColor: corSaldo } }, { content: '', styles: { fillColor: corSaldo } },
            { content: 'Saldo Anterior', styles: { fillColor: corSaldo, fontStyle: 'bold' } },
            { content: bloco.nome, styles: { fillColor: corSaldo } },
            { content: formatarMoedaPDF(bloco.saldoAnterior), styles: { fillColor: corSaldo, fontStyle: 'bold' } },
            { content: formatarMoedaPDF(bloco.saldoAnterior), styles: { fillColor: corSaldo, fontStyle: 'bold' } }
          ],
          ...bloco.transacoes.map(t => [t.data, t.tipo, t.descricao, t.categoria, t.conta, formatarMoedaPDF(t.valor), formatarMoedaPDF(t.saldoParcial)]),
          [
            { content: '', styles: { fillColor: corSaldo } }, { content: '', styles: { fillColor: corSaldo } }, { content: '', styles: { fillColor: corSaldo } },
            { content: 'Saldo Final', styles: { fillColor: corSaldo, fontStyle: 'bold' } },
            { content: bloco.nome, styles: { fillColor: corSaldo } },
            { content: formatarMoedaPDF(bloco.saldoFinal), styles: { fillColor: corSaldo, fontStyle: 'bold' } },
            { content: formatarMoedaPDF(bloco.saldoFinal), styles: { fillColor: corSaldo, fontStyle: 'bold' } }
          ]
        ]
      });
      y = doc.lastAutoTable.finalY + 8;
    });

    garantirEspaco(10);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text(`Total Geral: ${formatarMoedaPDF(dadosRel.totalSaldoFinal)}`, MARGEM, y);
    y += 10;

    // --- Contas a Pagar ---
    if (dadosRel.contasAPagarLinhas.length > 0) {
      garantirEspaco(16);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text('Contas a Pagar', MARGEM, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        margin: { left: MARGEM, right: MARGEM },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [9, 74, 0] },
        head: [['Descrição', 'Classificação Contábil', 'Vencimento', 'Valor', 'Status', 'Paga com']],
        body: dadosRel.contasAPagarLinhas.map(c => [c.descricao, c.categoria, c.vencimento, formatarMoedaPDF(c.valor), c.status, c.pagaCom])
      });
    }

    // Numeração de página em todas as páginas geradas.
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${p} de ${totalPaginas}`, LARGURA_PAGINA - MARGEM, ALTURA_PAGINA - 8, { align: 'right' });
    }

    doc.save(`relatorio-santo-barbearia-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const proximoVencimento = (dataBR) => {
    const [dia, mes, ano] = dataBR.split('/').map(Number);
    const d = new Date(ano, mes - 1 + 1, dia);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const handlePagarConta = (id, contaSelecionada, dataPagamentoISO) => {
    const conta = contasAPagar.find(c => c.id === id);
    if (!conta || !contaSelecionada) return;

    const novasContas = {
      ...contas,
      [contaSelecionada]: contas[contaSelecionada] - conta.valor
    };

    const agora = Date.now();
    const [anoPag, mesPag, diaPag] = (dataPagamentoISO || new Date().toISOString().slice(0, 10)).split('-');
    const dataPagamentoBR = `${diaPag}/${mesPag}/${anoPag}`;

    let novasContasAPagar = contasAPagar.map(c => {
      if (c.id !== id) return c;
      const { dataPagamentoSelecionada, ...resto } = c;
      return { ...resto, status: 'Pago', conta: contaSelecionada, dataPagamento: dataPagamentoBR };
    });

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
      data: dataPagamentoBR,
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
      descricao: capitalizarTexto(novaConta.descricao.trim()),
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
    let dataPagamentoISO = '';
    if (conta.dataPagamento) {
      const [diaP, mesP, anoP] = conta.dataPagamento.split('/');
      dataPagamentoISO = `${anoP}-${mesP}-${diaP}`;
    }
    setEditandoContaId(conta.id);
    setContaEditando({
      descricao: conta.descricao,
      valor: conta.valor,
      vencimento: `${ano}-${mes}-${dia}`,
      categoria: conta.categoria || '',
      recorrente: !!conta.recorrente,
      repeticoes: conta.repeticoesRestantes || '',
      dataPagamento: dataPagamentoISO
    });
  };

  const handleCancelarEdicaoConta = () => {
    setEditandoContaId(null);
    setContaEditando({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '', dataPagamento: '' });
  };

  const handleSalvarEdicaoConta = (id) => {
    if (!contaEditando.descricao.trim() || !(parseFloat(contaEditando.valor) > 0) || !contaEditando.vencimento) return;

    const contaAtual = contasAPagar.find(c => c.id === id);
    const [ano, mes, dia] = contaEditando.vencimento.split('-');
    const recorrente = !!contaEditando.recorrente;
    const dataPagamentoBR = contaEditando.dataPagamento
      ? (([anoP, mesP, diaP]) => `${diaP}/${mesP}/${anoP}`)(contaEditando.dataPagamento.split('-'))
      : contaAtual?.dataPagamento;

    const novasContasAPagar = contasAPagar.map(c => c.id === id ? {
      ...c,
      descricao: capitalizarTexto(contaEditando.descricao.trim()),
      valor: parseFloat(contaEditando.valor),
      vencimento: `${dia}/${mes}/${ano}`,
      categoria: contaEditando.categoria,
      recorrente,
      grupoRecorrente: recorrente ? (c.grupoRecorrente || c.id) : c.grupoRecorrente,
      repeticoesRestantes: recorrente ? (parseInt(contaEditando.repeticoes, 10) || 0) : 0,
      ...(c.status === 'Pago' ? { dataPagamento: dataPagamentoBR } : {})
    } : c);

    const precisaAtualizarMovimentacao = contaAtual?.status === 'Pago' && dataPagamentoBR && dataPagamentoBR !== contaAtual.dataPagamento;
    const novasMovimentacoes = precisaAtualizarMovimentacao
      ? movimentacoes.map(m => m.contaPagarId === id ? { ...m, data: dataPagamentoBR } : m)
      : movimentacoes;

    setContasAPagar(novasContasAPagar);
    if (precisaAtualizarMovimentacao) setMovimentacoes(novasMovimentacoes);
    setEditandoContaId(null);
    setContaEditando({ descricao: '', valor: '', vencimento: '', categoria: '', recorrente: false, repeticoes: '', dataPagamento: '' });

    salvarDados({ contas, contasAPagar: novasContasAPagar, comissoes, movimentacoes: novasMovimentacoes });
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
      descricao: capitalizarTexto(movimentacaoEditando.descricao.trim()),
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
    if (!(valor > 0) || !ajuste.data) return;

    const delta = ajuste.tipo === 'credito' ? valor : -valor;
    const novasContas = { ...contas, [ajuste.conta]: contas[ajuste.conta] + delta };

    const [ano, mes, dia] = ajuste.data.split('-');
    const novaMovimentacao = {
      id: Date.now(),
      data: `${dia}/${mes}/${ano}`,
      tipo: ajuste.tipo === 'credito' ? 'Crédito Manual' : 'Débito Manual',
      descricao: capitalizarTexto(ajuste.descricao.trim()) || (ajuste.tipo === 'credito' ? 'Crédito manual' : 'Débito manual'),
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

  // mesISO vem do seletor "Mês" do Resumo para Contabilidade (ex: ela pode
  // estar revisando Agosto em Setembro) — usar a data de hoje aqui, em vez do
  // mês que ela realmente está fechando, rotulava o fechamento com o mês
  // errado (ex: salvava os números de Agosto no histórico como "Setembro").
  const handleFecharMes = (mesISO) => {
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
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mes = mesISO || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const [anoMes, mesNumMes] = mes.split('-');
    const mesLabel = `${nomesMeses[parseInt(mesNumMes, 10) - 1]}/${anoMes}`;

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
    const novaNota = { id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), texto: capitalizarTexto(texto.trim()) };
    const novasNotas = [...notas, novaNota];
    setNotas(novasNotas);
    salvarDados({ notas: novasNotas });
  };

  const handleExcluirNota = (id) => {
    const novasNotas = notas.filter(n => n.id !== id);
    setNotas(novasNotas);
    salvarDados({ notas: novasNotas });
  };

  // Dados da empresa (logo + Razão Social/CNPJ/etc.) são salvos à parte da
  // rotina principal (salvarDados) — mudam raramente e, ao contrário do
  // resto, essa tabela pode ainda não existir em quem não rodou a migração
  // (database/migracao_dados_empresa.sql) ainda; se estivesse dentro do
  // salvarDados de todo mundo, um erro aqui dispararia o alerta de "não
  // consegui salvar" em QUALQUER ação do sistema, mesmo sem relação com isso.
  const handleSalvarDadosEmpresa = async (novoDados) => {
    setDadosEmpresa(novoDados);
    try {
      const resultado = await supabase.from('dados_empresa').upsert([paraLinhaDadosEmpresa(novoDados)]);
      if (resultado.error) throw new Error(resultado.error.message);
    } catch (erro) {
      console.error('Erro ao salvar dados da empresa:', erro);
      alert(
        'ATENÇÃO: não consegui salvar os Dados da Empresa no banco de dados!\n\n' +
        'O que você acabou de digitar está aparecendo na tela, mas ainda NÃO foi salvo de verdade.\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Se a mensagem falar em tabela ou coluna que não existe, você precisa rodar o script ' +
        'database/migracao_dados_empresa.sql no SQL Editor do Supabase uma vez, depois repita o Salvar aqui.'
      );
    }
  };

  // Faturamento de Produtos e Faturamento Total (histórico de meses antigos)
  // digitados no Resumo para Contabilidade — mesmo esquema de salvamento
  // dedicado dos Dados da Empresa (tabela própria, pode ainda não existir em
  // quem não rodou a migração). Cada campo salva só a sua própria coluna, sem
  // mexer no valor do outro campo daquele mesmo mês.
  const handleSalvarFaturamentoManual = async (mes, colunaDb, valor) => {
    const campoEstado = colunaDb === 'faturamento_produtos' ? 'faturamentoProdutos' : 'faturamentoTotalManual';
    const existente = faturamentoManual.find((f) => f.mes === mes) || { mes, faturamentoProdutos: 0, faturamentoTotalManual: null };
    const novaLista = [...faturamentoManual.filter((f) => f.mes !== mes), { ...existente, [campoEstado]: valor }];
    setFaturamentoManual(novaLista);
    try {
      const resultado = await supabase.from('faturamento_manual').upsert([{ mes, [colunaDb]: valor }]);
      if (resultado.error) throw new Error(resultado.error.message);
    } catch (erro) {
      console.error('Erro ao salvar faturamento manual:', erro);
      alert(
        'ATENÇÃO: não consegui salvar esse valor no banco de dados!\n\n' +
        'O que você acabou de digitar está aparecendo na tela, mas ainda NÃO foi salvo de verdade.\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Se a mensagem falar em tabela ou coluna que não existe, você precisa rodar o script ' +
        'database/migracao_faturamento_total_manual.sql no SQL Editor do Supabase uma vez, depois repita o Salvar aqui.'
      );
    }
  };
  const handleSalvarFaturamentoProdutos = (mes, valor) => handleSalvarFaturamentoManual(mes, 'faturamento_produtos', valor);
  const handleSalvarFaturamentoTotalManual = (mes, valor) => handleSalvarFaturamentoManual(mes, 'faturamento_total', valor);

  // Data e % do aumento de preço, usados na Projeção de Faturamento —
  // mesmo esquema de salvamento dedicado (tabela própria, pode ainda não
  // existir em quem não rodou a migração).
  const handleSalvarProjecaoParametros = async (novosParametros) => {
    setProjecaoParametros(novosParametros);
    try {
      const resultado = await supabase.from('parametros_projecao').upsert([{
        id: 1,
        data_aumento: novosParametros.dataAumento || null,
        percentual_aumento: novosParametros.percentualAumento || 0,
        percentual_crescimento: novosParametros.percentualCrescimento || 0
      }]);
      if (resultado.error) throw new Error(resultado.error.message);
    } catch (erro) {
      console.error('Erro ao salvar parâmetros da projeção:', erro);
      alert(
        'ATENÇÃO: não consegui salvar os Parâmetros de Projeção no banco de dados!\n\n' +
        'O que você acabou de digitar está aparecendo na tela, mas ainda NÃO foi salvo de verdade.\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Se a mensagem falar em tabela ou coluna que não existe, você precisa rodar o script ' +
        'database/migracao_percentual_crescimento.sql no SQL Editor do Supabase uma vez, depois repita o Salvar aqui.'
      );
    }
  };

  // "Pagamento Não Identificado" na Conciliação: um lançamento do Sistema
  // que ela não conseguiu explicar como foi pago fica de lado (não conta
  // como Faturamento Bruto) até ela descobrir e remover da lista. A chave
  // (descrição + valor) precisa ser estável entre uma conciliação e outra,
  // já que o id é recriado do zero a cada upload dos relatórios.
  const handleMarcarNaoIdentificado = async (item) => {
    const chave = `${item.descricao}|${item.valorBruto.toFixed(2)}`;
    if (pagamentosNaoIdentificados.some((p) => p.chave === chave)) return;
    // dados_completos guarda o lançamento inteiro (não só descrição/valor/data)
    // pra dar pra devolver ele pro Faturamento Bruto do Sistema, pronto pra
    // casar/lançar, quando ela descobrir a forma de pagamento e remover da lista.
    const novoRegistro = { id: Date.now(), chave, descricao: item.descricao, valor: item.valorBruto, data: item.data, dados_completos: item };
    setPagamentosNaoIdentificados([...pagamentosNaoIdentificados, novoRegistro]);
    try {
      const resultado = await supabase.from('pagamentos_nao_identificados').upsert([novoRegistro]);
      if (resultado.error) throw new Error(resultado.error.message);
    } catch (erro) {
      console.error('Erro ao marcar pagamento como não identificado:', erro);
      alert(
        'ATENÇÃO: não consegui salvar essa marcação no banco de dados!\n\n' +
        'O lançamento saiu da lista de pendências na tela, mas isso ainda NÃO foi salvo de verdade — ' +
        'ao recarregar a página ele volta a aparecer.\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Se a mensagem falar em tabela ou coluna que não existe, você precisa rodar os scripts ' +
        'database/migracao_pagamentos_nao_identificados.sql e database/migracao_resgates_cashbarber_pendentes.sql ' +
        'no SQL Editor do Supabase uma vez, depois repita aqui.'
      );
    }
  };

  const handleRemoverNaoIdentificado = async (chave) => {
    const registro = pagamentosNaoIdentificados.find((p) => p.chave === chave);
    setPagamentosNaoIdentificados(pagamentosNaoIdentificados.filter((p) => p.chave !== chave));
    if (!registro) return;
    try {
      const resultado = await supabase.from('pagamentos_nao_identificados').delete().eq('id', registro.id);
      if (resultado.error) throw new Error(resultado.error.message);
    } catch (erro) {
      console.error('Erro ao remover pagamento não identificado:', erro);
      alert(
        'ATENÇÃO: não consegui remover essa marcação no banco de dados!\n\n' +
        'Motivo: ' + erro.message
      );
    }
  };

  const handleAdicionarCategoria = (nivel1, nivel2) => {
    if (!nivel1.trim() || !nivel2.trim()) return;
    const nivel1Formatado = capitalizarTexto(nivel1.trim());
    const nivel2Formatado = capitalizarTexto(nivel2.trim());
    const jaExiste = categorias.some(c => c.nivel1 === nivel1Formatado && c.nivel2 === nivel2Formatado);
    if (jaExiste) return;
    const novaCategoria = { id: Date.now(), nivel1: nivel1Formatado, nivel2: nivel2Formatado };
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
      descricao: `${capitalizarTexto(linhaExtrato.descricao)} (lançado da Conciliação)`,
      valor: linhaExtrato.valor,
      conta: 'sicredi',
      categoria: linhaExtrato.categoria || ''
    };
    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
  };

  // Igual ao handleLancarDoExtrato, mas pra lançar VÁRIAS linhas de uma vez só
  // (ex: várias vendas sem comanda de um mesmo depósito da maquininha) num só
  // round-trip ao banco. Chamar handleLancarDoExtrato repetidas vezes no mesmo
  // clique não funcionaria: cada chamada leria "movimentacoes"/"contas" do
  // mesmo estado (ainda não atualizado pela chamada anterior) e cada uma
  // sobrescreveria o resultado da anterior em vez de somar — só a última
  // linha do lote acabaria sendo salva de verdade.
  const handleLancarVariasNaContaCorrente = (linhas) => {
    const baseId = Date.now();
    let delta = 0;
    const novasMovs = linhas.map((linha, i) => {
      const [ano, mes, dia] = linha.data.split('-');
      delta += linha.tipo === 'entrada' ? linha.valor : -linha.valor;
      return {
        id: baseId + i,
        data: `${dia}/${mes}/${ano}`,
        tipo: linha.tipo === 'entrada' ? 'Crédito Manual' : 'Débito Manual',
        descricao: `${capitalizarTexto(linha.descricao)} (lançado da Conciliação)`,
        valor: linha.valor,
        conta: 'sicredi',
        categoria: linha.categoria || ''
      };
    });
    const novasContas = { ...contas, sicredi: contas.sicredi + delta };
    const novasMovimentacoes = [...movimentacoes, ...novasMovs];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
  };

  // Divide uma linha do extrato (ex: uma compra no mercado que mistura
  // material de limpeza, bebidas e insumos de lanche no mesmo débito) em
  // várias movimentações — o valor total lançado na Conta Corrente continua
  // igual ao da linha do banco, só a classificação contábil é repartida.
  const handleDividirLancamento = (linhaExtrato, partes) => {
    const [ano, mes, dia] = linhaExtrato.data.split('-');
    const dataBR = `${dia}/${mes}/${ano}`;
    const totalPartes = partes.reduce((soma, p) => soma + p.valor, 0);
    const delta = linhaExtrato.tipo === 'entrada' ? totalPartes : -totalPartes;
    const novasContas = { ...contas, sicredi: contas.sicredi + delta };

    const baseId = Date.now();
    const novasMovs = partes.map((parte, i) => ({
      id: baseId + i,
      data: dataBR,
      tipo: linhaExtrato.tipo === 'entrada' ? 'Crédito Manual' : 'Débito Manual',
      descricao: `${capitalizarTexto(linhaExtrato.descricao)} (parte ${i + 1}/${partes.length} - lançado da Conciliação)`,
      valor: parte.valor,
      conta: 'sicredi',
      categoria: parte.categoria || ''
    }));
    const novasMovimentacoes = [...movimentacoes, ...novasMovs];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
  };

  // Lança no Caixa um recebimento em dinheiro do Relatório do Sistema — não
  // passa pelo banco nem pela maquininha, então não tem com o que conciliar,
  // só precisa entrar no saldo do Caixa igual um Crédito Manual normal.
  const handleLancarCaixa = (linha) => {
    const [ano, mes, dia] = linha.data.split('-');
    const novasContas = { ...contas, caixa: contas.caixa + linha.valor };

    const novaMovimentacao = {
      id: Date.now(),
      data: `${dia}/${mes}/${ano}`,
      tipo: 'Crédito Manual',
      descricao: `${capitalizarTexto(linha.descricao)} (dinheiro - lançado da Conciliação)`,
      valor: linha.valor,
      conta: 'caixa',
      categoria: linha.categoria || ''
    };
    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
  };

  // Lança o faturamento de comandas do Sistema pelo valor BRUTO (o que o
  // cliente pagou) — quando a comanda teve taxa de maquininha, cria também
  // uma Despesa só com a taxa, na mesma conta. A soma das duas dá exatamente
  // o valor líquido que realmente caiu no banco, então o saldo da Conta
  // Corrente bate com o extrato mesmo sem nunca ter passado por lá. Recebe
  // uma lista pra dar pra lançar uma comanda ou todas de uma vez só, sem
  // fazer um round-trip ao banco de dados por comanda.
  const handleLancarFaturamentoBruto = (linhas) => {
    const baseId = Date.now();
    let delta = 0;
    const novasMovs = [];
    linhas.forEach((linha, i) => {
      // Pra cartão, usa a data em que o dinheiro realmente caiu na Conta
      // Corrente (data de pagamento da maquininha), não o dia da venda — é
      // isso que bate com o extrato e mantém a Visão Geral na mesma ordem do
      // banco. Pix cai no mesmo dia, então usa a data da comanda mesmo.
      const [ano, mes, dia] = (linha.dataPagamento || linha.data).split('-');
      const dataBR = `${dia}/${mes}/${ano}`;
      delta += linha.valorBruto;
      novasMovs.push({
        id: baseId + i * 2,
        data: dataBR,
        tipo: 'Crédito Manual',
        descricao: `${capitalizarTexto(linha.descricao)} (lançado da Conciliação)`,
        valor: linha.valorBruto,
        conta: 'sicredi',
        categoria: linha.categoria || ''
      });
      if (linha.taxa > 0) {
        delta -= linha.taxa;
        novasMovs.push({
          id: baseId + i * 2 + 1,
          data: dataBR,
          tipo: 'Débito Manual',
          descricao: `Taxa da maquininha - ${capitalizarTexto(linha.descricao)} (lançado da Conciliação)`,
          valor: linha.taxa,
          conta: 'sicredi',
          categoria: 'Taxas de Cartão/Maquininha > MDR (Taxa da Maquininha)'
        });
      }
    });

    const novasContas = { ...contas, sicredi: contas.sicredi + delta };
    const novasMovimentacoes = [...movimentacoes, ...novasMovs];

    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });
  };

  // Lança na Conta Corrente o resgate de um lote de assinaturas cobradas pelo
  // próprio Cash Barber (Conciliação > "Aguardando Resgate do Cash Barber").
  // A soma BRUTO de todas as selecionadas vira uma Receita só, e a soma dos
  // descontos (a taxa que o Cash Barber já embute) vira uma Despesa separada
  // — igual o Faturamento Bruto do Sistema já faz com a taxa da maquininha.
  // A data usada é a que ela escolheu (quando o Pix do resgate realmente caiu
  // no banco), nunca a "Data de liquidação" do relatório (essa só marca
  // quando o valor ficou disponível pra pedir, não quando entrou de verdade).
  // Guarda também o id de cada transação num registro à parte (dedicado, não
  // no salvarDados geral) pra elas não voltarem a aparecer como pendentes
  // numa conciliação futura, mesmo depois de reenviar o mesmo relatório.
  const handleLancarResgateCashBarber = async (itens, dataResgate) => {
    if (!itens || itens.length === 0 || !dataResgate) return;
    const baseId = Date.now();
    const [ano, mes, dia] = dataResgate.split('-');
    const dataBR = `${dia}/${mes}/${ano}`;
    const totalBruto = Math.round(itens.reduce((s, i) => s + i.valorBruto, 0) * 100) / 100;
    const totalDesconto = Math.round(itens.reduce((s, i) => s + i.desconto, 0) * 100) / 100;
    const descricaoBase = itens.length === 1
      ? `Resgate Cash Barber - ${itens[0].cliente}`
      : `Resgate Cash Barber (${itens.length} assinaturas)`;

    const novasMovs = [{
      id: baseId,
      data: dataBR,
      tipo: 'Crédito Manual',
      descricao: `${capitalizarTexto(descricaoBase)} (lançado da Conciliação)`,
      valor: totalBruto,
      conta: 'sicredi',
      categoria: 'Receitas > Produtos e Serviços'
    }];
    let delta = totalBruto;
    if (totalDesconto > 0) {
      novasMovs.push({
        id: baseId + 1,
        data: dataBR,
        tipo: 'Débito Manual',
        descricao: `Taxa Cash Barber - ${capitalizarTexto(descricaoBase)} (lançado da Conciliação)`,
        valor: totalDesconto,
        conta: 'sicredi',
        categoria: 'Assinaturas e Sistemas > Assinaturas e Sistemas'
      });
      delta -= totalDesconto;
    }

    const novasContas = { ...contas, sicredi: contas.sicredi + delta };
    const novasMovimentacoes = [...movimentacoes, ...novasMovs];
    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, movimentacoes: novasMovimentacoes });

    const novosRegistros = itens.map((i) => ({
      transacao_id: i.transacaoId,
      cliente: i.cliente,
      valor_bruto: i.valorBruto,
      valor_desconto: i.desconto,
      valor_liquido: i.valorLiquido,
      data_transacao: i.dataTransacao,
      data_liquidacao: i.dataLiquidacao,
      data_resgate: dataResgate
    }));
    setResgatesCashBarberLancados((r) => [...r, ...novosRegistros]);
    // Tira dos pendentes — já foi resolvido, não precisa mais ficar
    // "aguardando resgate" (o card já filtra pelos lançados mesmo, mas
    // limpar evita a tabela de pendentes crescer pra sempre).
    const idsLancados = new Set(itens.map((i) => i.transacaoId));
    setResgatesCashBarberPendentes((r) => r.filter((p) => !idsLancados.has(p.transacao_id)));
    try {
      const [resultadoLancados, resultadoPendentes] = await Promise.all([
        supabase.from('resgates_cashbarber_lancados').upsert(novosRegistros, { onConflict: 'transacao_id' }),
        supabase.from('resgates_cashbarber_pendentes').delete().in('transacao_id', [...idsLancados])
      ]);
      if (resultadoLancados.error) throw new Error(resultadoLancados.error.message);
      if (resultadoPendentes.error) throw new Error(resultadoPendentes.error.message);
    } catch (erro) {
      console.error('Erro ao salvar resgate Cash Barber:', erro);
      alert(
        'ATENÇÃO: o lançamento na Conta Corrente foi feito, mas não consegui salvar o registro do resgate no banco de dados!\n\n' +
        'Isso significa que, ao recarregar a página, essas assinaturas podem voltar a aparecer em "Aguardando Resgate" — se isso acontecer, NÃO lance de novo (a Receita já foi lançada agora), só ignore.\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Se a mensagem falar em tabela ou coluna que não existe, você precisa rodar os scripts ' +
        'database/migracao_resgates_cashbarber.sql e database/migracao_resgates_cashbarber_pendentes.sql no SQL Editor do Supabase uma vez.'
      );
    }
  };

  // Assim que um relatório de Transações Financeiras é conciliado, guarda
  // (upsert) cada transação numa tabela persistida — sem isso, o card
  // "Aguardando Resgate do Cash Barber" dependia só do relatório carregado
  // NAQUELA sessão e sumia ao recarregar a página, igual ela reportou.
  const handleRegistrarPendentesResgate = async (itens) => {
    if (!itens || itens.length === 0) return;
    const registros = itens.map((i) => ({
      transacao_id: i.transacaoId,
      cliente: i.cliente,
      descricao: i.descricao,
      valor_bruto: i.valorBruto,
      valor_liquido: i.valorLiquido,
      desconto: i.desconto,
      data_transacao: i.dataTransacao,
      data_liquidacao: i.dataLiquidacao,
      casada: i.casada
    }));
    setResgatesCashBarberPendentes((r) => {
      const porId = new Map(r.map((x) => [x.transacao_id, x]));
      registros.forEach((reg) => porId.set(reg.transacao_id, reg));
      return [...porId.values()];
    });
    try {
      const resultado = await supabase.from('resgates_cashbarber_pendentes').upsert(registros, { onConflict: 'transacao_id' });
      if (resultado.error) throw new Error(resultado.error.message);
    } catch (erro) {
      console.error('Erro ao salvar pendências de resgate Cash Barber:', erro);
      alert(
        'ATENÇÃO: não consegui salvar essas transações do Cash Barber no banco de dados!\n\n' +
        'Elas estão aparecendo em "Aguardando Resgate do Cash Barber" agora, mas podem sumir se você recarregar a página antes de conseguir salvar de novo (reenviando o relatório e reconciliando).\n\n' +
        'Motivo: ' + erro.message + '\n\n' +
        'Se a mensagem falar em tabela ou coluna que não existe, você precisa rodar o script ' +
        'database/migracao_resgates_cashbarber_pendentes.sql no SQL Editor do Supabase uma vez.'
      );
    }
  };

  // A taxa da maquininha não é uma conta que fica em aberto esperando
  // pagamento — ela já é descontada pela própria maquininha antes do
  // dinheiro cair na Conta Corrente (o que chega no banco já é o valor
  // líquido). Por isso vai direto como um Débito Manual na Conta Corrente,
  // já "pago", em vez de virar uma Conta a Pagar em aberto.
  const handleCriarContaTaxaMaquininha = (valor) => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const valorArredondado = Math.round(valor * 100) / 100;
    const novasContas = { ...contas, sicredi: contas.sicredi - valorArredondado };
    const novaMovimentacao = {
      id: Date.now(),
      data: hoje,
      tipo: 'Débito Manual',
      descricao: 'Taxas da Maquininha',
      valor: valorArredondado,
      conta: 'sicredi',
      categoria: 'Taxas de Cartão/Maquininha > MDR (Taxa da Maquininha)'
    };
    const novasMovimentacoes = [...movimentacoes, novaMovimentacao];
    setContas(novasContas);
    setMovimentacoes(novasMovimentacoes);
    salvarDados({ contas: novasContas, contasAPagar, comissoes, movimentacoes: novasMovimentacoes });
  };

  // Igual ao handleCriarContaTaxaMaquininha, mas um lançamento por dia, na
  // data real em que a taxa foi descontada — assim o saldo da Conta Corrente
  // bate diariamente em vez de concentrar tudo "hoje".
  const handleCriarContasTaxaMaquininhaPorDia = (dias) => {
    const agora = Date.now();
    const totalDias = dias.reduce((soma, d) => soma + (Math.round(d.valor * 100) / 100), 0);
    const novasContas = { ...contas, sicredi: contas.sicredi - Math.round(totalDias * 100) / 100 };
    const novasMovimentacoes = dias.map((dia, i) => {
      const [ano, mes, diaNum] = dia.data.split('-');
      const dataBR = `${diaNum}/${mes}/${ano}`;
      return {
        id: agora + i,
        data: dataBR,
        tipo: 'Débito Manual',
        descricao: 'Taxas da Maquininha',
        valor: Math.round(dia.valor * 100) / 100,
        conta: 'sicredi',
        categoria: 'Taxas de Cartão/Maquininha > MDR (Taxa da Maquininha)'
      };
    });
    const todasMovimentacoes = [...movimentacoes, ...novasMovimentacoes];
    setContas(novasContas);
    setMovimentacoes(todasMovimentacoes);
    salvarDados({ contas: novasContas, contasAPagar, comissoes, movimentacoes: todasMovimentacoes });
  };

  const handleTransferencia = () => {
    if (transferencia.valor <= 0 || transferencia.de === transferencia.para || !transferencia.data) return;

    const novasContas = {
      ...contas,
      [transferencia.de]: contas[transferencia.de] - parseFloat(transferencia.valor),
      [transferencia.para]: contas[transferencia.para] + parseFloat(transferencia.valor)
    };

    const [anoTransf, mesTransf, diaTransf] = transferencia.data.split('-');
    const novaMovimentacao = {
      id: Date.now(),
      data: `${diaTransf}/${mesTransf}/${anoTransf}`,
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
          {dadosEmpresa.logo && <img src={dadosEmpresa.logo} alt="Logo" className="logo-header" />}
          <h1>Santo Barbearia - Controle Financeiro</h1>
          <p className="subtitle">Agosto 2026</p>
        </header>

        <div className="cards-saldos">
          {Object.keys(contas).map((chave) => (
            <div key={chave} className="card-saldo">
              <p className="label">{nomesContas[chave]}</p>
              <p className="valor">R$ {saldoNoFimDoPeriodo(chave).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          ))}
          <div className="card-saldo total">
            <p className="label">TOTAL GERAL{(vgInicio || vgFim) ? ` (até ${vgFim ? isoParaBR(vgFim) : 'hoje'})` : ''}</p>
            <p className="valor">
              R$ {Object.keys(contas).reduce((soma, chave) => soma + saldoNoFimDoPeriodo(chave), 0)
                .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="tabs">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'visao-geral', label: 'Visão Geral' },
            { id: 'contas-pagar', label: 'Contas a Pagar' },
            { id: 'comissoes', label: 'Comissões' },
            { id: 'transferencias', label: 'Transferências' },
            { id: 'conciliacao', label: 'Conciliação' },
            { id: 'parametros', label: 'Parâmetros' }
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
                    <label>Data</label>
                    <input
                      type="date"
                      value={ajuste.data}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && !anoValido(v)) return;
                        setAjuste({ ...ajuste, data: v });
                      }}
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
                    disabled={!(parseFloat(ajuste.valor) > 0) || !ajuste.data}
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
                    <input
                      type="date"
                      value={vgPeriodoInicio}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && !anoValido(v)) return;
                        setVgPeriodoInicio(v);
                      }}
                    />
                  </div>
                  <div className="input-group">
                    <label>Até</label>
                    <input
                      type="date"
                      value={vgPeriodoFim}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && !anoValido(v)) return;
                        setVgPeriodoFim(v);
                      }}
                    />
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
                  <button onClick={handleExportarRelatorioPDF} className="btn-transferir">
                    Exportar Relatório (PDF)
                  </button>
                </div>
                <p className="upload-dica">Gera o resumo, as movimentações e as contas a pagar do período/conta filtrados acima, com a logo e os dados da empresa (cadastrados no Dashboard) — pronto pra mandar pro contador.</p>
              </div>

              <div className="card">
                <h3>Resumo Financeiro {(vgInicio || vgFim) ? 'do Período' : ''}</h3>
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
                      <p>Nenhuma conta em aberto {(vgInicio || vgFim) ? 'nesse período' : ''}.</p>
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
                      <th>Saldo Anterior</th>
                      <th>Entradas</th>
                      <th>Saídas</th>
                      <th>Saldo do Período</th>
                      <th>Saldo Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldoPorContaVG.map(linha => (
                      <tr key={linha.chave}>
                        <td>{linha.nome}</td>
                        <td>R$ {linha.saldoAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="valor-entrada">R$ {linha.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="valor-saida">R$ {linha.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>R$ {linha.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td><strong>R$ {linha.saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3>Movimentações {(vgInicio || vgFim || vgTipoConta !== 'todas') ? 'do Período/Conta Filtrados' : ''} ({movimentacoesVGporConta.length})</h3>
                {movimentacoesVGporConta.length === 0 ? (
                  <p>Nenhuma movimentação {(vgInicio || vgFim || vgTipoConta !== 'todas') ? 'nesse filtro' : 'registrada'}.</p>
                ) : (
                  <table className="tabela">
                    <tbody>
                      {[...movimentacoesVGporConta].sort((a, b) => dataMovParaISO(a.data).localeCompare(dataMovParaISO(b.data)) || a.id - b.id).reverse().map((mov) => {
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
                            <td>{formatarDataMovParaExibir(mov.data)}</td>
                            <td>
                              <span className={`badge-${tipoVisual}`}>
                                {tipoVisual === 'entrada' ? 'Entrada' : tipoVisual === 'saida' ? 'Saída' : 'Transferência'}
                              </span>
                              {mov.descricao}{mov.categoria && <span className="badge-categoria"> {mov.categoria}</span>}
                            </td>
                            <td>R$ {mov.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>
                              {mov.tipo === 'Despesa Paga' && mov.contaPagarId && (
                                <div className="acoes">
                                  <button onClick={() => handleDesfazerPagamento(mov.contaPagarId)} className="btn-excluir">Desfazer Pagamento</button>
                                </div>
                              )}
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
                        {conta.status === 'Pago' && (
                          <div className="input-group">
                            <label>Data de Pagamento</label>
                            <input
                              type="date"
                              value={contaEditando.dataPagamento}
                              onChange={(e) => setContaEditando({ ...contaEditando, dataPagamento: e.target.value })}
                            />
                          </div>
                        )}
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
                        <input
                          type="date"
                          value={conta.dataPagamentoSelecionada || new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setContasAPagar(contasAPagar.map(c => c.id === conta.id ? { ...c, dataPagamentoSelecionada: e.target.value } : c))}
                        />
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
                          onClick={() => handlePagarConta(conta.id, conta.conta, conta.dataPagamentoSelecionada || new Date().toISOString().slice(0, 10))}
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
                        editandoContaId === conta.id ? (
                          <tr key={conta.id}>
                            <td colSpan={5}>
                              <div className="item-conta-editando">
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
                                    <label>Data de Pagamento</label>
                                    <input
                                      type="date"
                                      value={contaEditando.dataPagamento}
                                      onChange={(e) => setContaEditando({ ...contaEditando, dataPagamento: e.target.value })}
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
                                </div>
                                <div className="acoes">
                                  <button onClick={() => handleSalvarEdicaoConta(conta.id)} className="btn-salvar">Salvar</button>
                                  <button onClick={handleCancelarEdicaoConta} className="btn-cancelar">Cancelar</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={conta.id}>
                            <td>{conta.descricao}{conta.categoria && <span className="badge-categoria"> {conta.categoria}</span>}</td>
                            <td>R$ {conta.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>Pago com: {nomesContas[conta.conta] || '—'}</td>
                            <td>Pago em: {conta.dataPagamento || conta.data}</td>
                            <td>
                              <button onClick={() => handleIniciarEdicaoConta(conta)} className="btn-editar">Editar</button>
                              <button onClick={() => handleDesfazerPagamento(conta.id)} className="btn-excluir">Desfazer</button>
                            </td>
                          </tr>
                        )
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
                <div className="input-group">
                  <label>Data</label>
                  <input
                    type="date"
                    value={transferencia.data}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && !anoValido(v)) return;
                      setTransferencia({ ...transferencia, data: v });
                    }}
                  />
                </div>
                <button
                  onClick={handleTransferencia}
                  disabled={transferencia.valor <= 0 || transferencia.de === transferencia.para || !transferencia.data}
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
                      {movimentacoes.filter(m => m.tipo === 'Transferência').sort((a, b) => dataMovParaISO(a.data).localeCompare(dataMovParaISO(b.data)) || a.id - b.id).slice(-5).reverse().map((mov) => (
                        <tr key={mov.id}>
                          <td>{formatarDataMovParaExibir(mov.data)}</td>
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
              onLancarVariasNaContaCorrente={handleLancarVariasNaContaCorrente}
              onDividirLancamento={handleDividirLancamento}
              onLancarFaturamentoBruto={handleLancarFaturamentoBruto}
              onLancarCaixa={handleLancarCaixa}
              onCriarContaTaxaMaquininha={handleCriarContaTaxaMaquininha}
              onCriarContasTaxaMaquininhaPorDia={handleCriarContasTaxaMaquininhaPorDia}
              pagamentosNaoIdentificados={pagamentosNaoIdentificados}
              onMarcarNaoIdentificado={handleMarcarNaoIdentificado}
              onRemoverNaoIdentificado={handleRemoverNaoIdentificado}
              resgatesCashBarberPendentes={resgatesCashBarberPendentes}
              onRegistrarPendentesResgate={handleRegistrarPendentesResgate}
              resgatesCashBarberLancados={resgatesCashBarberLancados}
              onLancarResgateCashBarber={handleLancarResgateCashBarber}
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
                movimentacoes={movimentacoes}
                faturamentoManual={faturamentoManual}
                onSalvarFaturamentoProdutos={handleSalvarFaturamentoProdutos}
                onSalvarFaturamentoTotalManual={handleSalvarFaturamentoTotalManual}
                projecaoParametros={projecaoParametros}
                onSalvarProjecaoParametros={handleSalvarProjecaoParametros}
                onFecharMes={handleFecharMes}
                onAdicionarNota={handleAdicionarNota}
                onExcluirNota={handleExcluirNota}
              />
            </div>
          )}

          {activeTab === 'parametros' && (
            <div>
              <GerenciarCategorias
                categorias={categorias}
                onAdicionar={handleAdicionarCategoria}
                onExcluir={handleExcluirCategoria}
              />
              <DadosEmpresa
                dadosEmpresa={dadosEmpresa}
                onSalvar={handleSalvarDadosEmpresa}
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
