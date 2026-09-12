import React, { useState } from 'react';
import {
  parseOFX,
  parseCNAB240,
  parseCSVBruto,
  parseXLSXBruto,
  normalizarComMapeamento,
  parsePDF,
  detectarFormatoConhecido,
  parseSicrediPagamentos,
  parseSicrediPagamentosDetalhado,
  parseSicrediPagamentosComoVendas,
  agruparPagamentosPorDeposito,
  parseSicrediVendas,
  ligarVendasComPagamentos,
  parseBalancoSistema,
  parseMovimentacoesSistema,
  calcularTaxasPagamentos,
  calcularTaxasVendas,
  calcularTaxasPagamentosPorDia,
  calcularTaxasVendasPorDia,
  lerTextoArquivo,
  paraDataISO
} from './conciliacao/parsers';
import { conciliar } from './conciliacao/matching';
import CategoriaSelect from './CategoriaSelect';

const FONTE_VAZIA = { linhas: [], arquivo: null, carregando: false, erro: null, nota: null, taxaMaquininha: null, taxaMaquininhaPorDia: null, pagamentosDetalhado: null, vendasDerivadas: null };

const NOTAS_FORMATO = {
  'sicredi-pagamentos': 'Relatório de Pagamentos da Sicredi reconhecido: os valores foram agrupados por dia/bandeira/tipo, do jeito que chegam no extrato. Esse relatório já traz tudo que o de Vendas traria (e mais a data de pagamento) — não precisa subir o Relatório de Vendas também, a não ser que queira uma conferência extra por Código de Autorização.',
  'sicredi-vendas': 'Relatório de Vendas da Sicredi reconhecido: uma linha por venda (valor bruto, antes do desconto da maquininha), pra conferir com o Sistema.',
  'balanco-sistema': 'Balanço do sistema reconhecido: recebimentos via Pix (conferidos com o extrato) e via cartão (conferidos com o relatório de Vendas) já pagos.',
  'sistema-movimentacoes': 'Relatório de Movimentações do sistema reconhecido: recebimentos via Pix (conferidos com o extrato) e via cartão (conferidos com o relatório de Vendas). Esse relatório não traz a taxa da maquininha por comanda — use "Vendas × Pagamentos da Maquininha" pra conferir a taxa real de cada venda no cartão.'
};

const LABELS_FONTE = {
  extrato: 'Extrato Bancário',
  sistema: 'Relatório do Sistema',
  maquininha: 'Relatório de Pagamentos da Maquininha',
  vendas: 'Relatório de Vendas da Maquininha (opcional)'
};

// A maioria dos recebimentos do extrato é dessa classificação — já vem
// pré-selecionada nas entradas sem correspondência, mas continua editável.
const CATEGORIA_PADRAO_RECEBIMENTO = 'Receitas > Produtos e Serviços';

function formatarMoeda(valor) {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Descrição de uma venda da maquininha que não tem comanda no Sistema — usada
// tanto pra lançar (Composição dos Depósitos) quanto pra reconhecer, numa
// conciliação futura, que aquela venda específica já foi lançada antes (pelo
// Código de Autorização, que não se repete).
function descricaoVendaSemComanda(item) {
  const hora = item.dataHoraVenda ? ` ${item.dataHoraVenda.slice(11, 16)}` : '';
  const codigo = item.codigoAutorizacao ? ` (Cód. ${item.codigoAutorizacao})` : '';
  return `Venda sem comanda no Sistema - ${item.bandeira} - ${formatarDataBR(item.dataVenda)}${hora}${codigo}`;
}

// Reduz uma descrição do extrato ao "miolo" dela (sem número de referência,
// data ou pontuação), pra comparar "SICREDI DEBITO ELO-862207549 |0001-59"
// desse mês com "SICREDI DEBITO ELO-839911204 |0001-59" de um mês anterior
// e reconhecer que é o mesmo tipo de lançamento.
function normalizarDescricaoParaComparacao(descricao) {
  return String(descricao || '')
    .toUpperCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Diferente de normalizarDescricaoParaComparacao (que apaga números de
// propósito pra sugerir categoria por "tipo de lançamento"), esta MANTÉM os
// números — é usada pra detectar se ela já lançou essa mesma comanda/dia
// antes (ex: reconciliando o mesmo mês de novo), onde a data/hora dentro da
// descrição é exatamente o que diferencia um lançamento do outro.
function normalizarParaConferirDuplicata(descricao) {
  return String(descricao || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A movimentação salva guarda "<descrição original> (lançado da Conciliação)"
// — então a descrição original é sempre um prefixo dela.
function foiLancadoAntes(candidatos, descricaoOriginal, valor) {
  const alvo = normalizarParaConferirDuplicata(descricaoOriginal);
  return candidatos.some((c) => Math.abs(c.valor - valor) < 0.01 && c.normalizado.startsWith(alvo));
}

export default function Conciliacao({ contasAPagar, movimentacoes, categorias, onLancarMovimentacao, onLancarCaixa, onCriarContaTaxaMaquininha, onCriarContasTaxaMaquininhaPorDia, onDividirLancamento, onLancarFaturamentoBruto }) {
  const [fontes, setFontes] = useState({
    extrato: { ...FONTE_VAZIA },
    sistema: { ...FONTE_VAZIA },
    maquininha: { ...FONTE_VAZIA },
    vendas: { ...FONTE_VAZIA }
  });
  const [mapeando, setMapeando] = useState(null);
  const [mapeamentoForm, setMapeamentoForm] = useState({ temCabecalho: true, colData: '0', colDescricao: '1', colValor: '2' });
  const [resultado, setResultado] = useState(null);
  const [ignorados, setIgnorados] = useState(new Set());
  const [categoriaPorLinha, setCategoriaPorLinha] = useState({});
  const [dividindo, setDividindo] = useState(null);
  const [partesDivisao, setPartesDivisao] = useState([]);
  const [selecionadosFaturamento, setSelecionadosFaturamento] = useState(new Set());
  const [casamentoManual, setCasamentoManual] = useState(null);
  const [mostrarJaCasados, setMostrarJaCasados] = useState(false);
  const [secoesRecolhidas, setSecoesRecolhidas] = useState(new Set());
  const [depositosExpandidos, setDepositosExpandidos] = useState(new Set());
  const alternarDeposito = (id) => {
    setDepositosExpandidos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const alternarSecao = (chave) => {
    setSecoesRecolhidas((s) => {
      const novo = new Set(s);
      if (novo.has(chave)) novo.delete(chave); else novo.add(chave);
      return novo;
    });
  };

  // Cabeçalho padrão dos cards de resultado, com botão de recolher/expandir
  // pra não precisar rolar tanto entre uma seção e outra.
  const renderTituloSecao = (titulo, chave) => {
    const aberta = !secoesRecolhidas.has(chave);
    return (
      <div className="acoes" style={{ justifyContent: 'space-between', marginBottom: aberta ? 10 : 0 }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <button onClick={() => alternarSecao(chave)} className="btn-editar">{aberta ? '▲ Recolher' : '▼ Expandir'}</button>
      </div>
    );
  };
  const [taxaJaLancada, setTaxaJaLancada] = useState(false);
  const [diasTaxaLancados, setDiasTaxaLancados] = useState(new Set());

  const atualizarFonte = (chave, patch) => {
    setFontes((f) => ({ ...f, [chave]: { ...f[chave], ...patch } }));
  };

  const finalizarComLinhas = (chave, linhas, nomeArquivo, nota, taxaMaquininha, taxaMaquininhaPorDia, pagamentosDetalhado) => {
    if (linhas.length === 0) {
      atualizarFonte(chave, {
        carregando: false,
        erro: `O arquivo "${nomeArquivo}" foi lido, mas não encontramos nenhum lançamento nele. Confira se é o arquivo certo e se o período selecionado não veio vazio.`
      });
    } else {
      atualizarFonte(chave, {
        linhas,
        arquivo: nomeArquivo,
        carregando: false,
        nota: nota || null,
        taxaMaquininha: taxaMaquininha ?? null,
        taxaMaquininhaPorDia: taxaMaquininhaPorDia ?? null,
        pagamentosDetalhado: pagamentosDetalhado ?? null
      });
    }
  };

  const handleArquivo = async (chave, arquivo) => {
    if (!arquivo) return;
    const ext = arquivo.name.split('.').pop().toLowerCase();
    atualizarFonte(chave, { carregando: true, erro: null });

    try {
      if (ext === 'ofx') {
        const texto = await lerTextoArquivo(arquivo);
        const linhas = parseOFX(texto);
        finalizarComLinhas(chave, linhas, arquivo.name);
      } else if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
        const bruto = ext === 'csv' ? await parseCSVBruto(await lerTextoArquivo(arquivo)) : await parseXLSXBruto(await arquivo.arrayBuffer());
        const formato = detectarFormatoConhecido(bruto);

        if (formato === 'sicredi-pagamentos' && chave === 'vendas') {
          atualizarFonte(chave, {
            carregando: false,
            erro: 'Esse é o relatório de Pagamentos (valores líquidos) — suba ele em cima, em "Relatório de Pagamentos da Maquininha", que é o que concilia com o extrato.'
          });
        } else if (formato === 'sicredi-vendas' && chave === 'maquininha') {
          atualizarFonte(chave, {
            carregando: false,
            erro: 'Esse é o relatório de Vendas (valores brutos) — suba ele no campo "Relatório de Vendas da Maquininha" abaixo, que é o que concilia com o Sistema. Pra conciliar com o extrato, use o relatório de Pagamentos.'
          });
        } else if (formato === 'sicredi-pagamentos') {
          const linhas = parseSicrediPagamentos(bruto);
          const taxaMaquininha = calcularTaxasPagamentos(bruto);
          const taxaMaquininhaPorDia = calcularTaxasPagamentosPorDia(bruto);
          const pagamentosDetalhado = parseSicrediPagamentosDetalhado(bruto);
          // O relatório de Pagamentos já traz tudo que o relatório de Vendas traria
          // (e mais: a data de pagamento) — reconstruímos as vendas a partir dele,
          // pra ela não precisar subir os dois relatórios da maquininha.
          const vendasDerivadas = parseSicrediPagamentosComoVendas(bruto);
          atualizarFonte(chave, { vendasDerivadas });
          finalizarComLinhas(chave, linhas, arquivo.name, NOTAS_FORMATO[formato], taxaMaquininha, taxaMaquininhaPorDia, pagamentosDetalhado);
        } else if (formato === 'sicredi-vendas') {
          const linhas = parseSicrediVendas(bruto);
          const taxaMaquininha = calcularTaxasVendas(bruto);
          const taxaMaquininhaPorDia = calcularTaxasVendasPorDia(bruto);
          finalizarComLinhas(chave, linhas, arquivo.name, NOTAS_FORMATO[formato], taxaMaquininha, taxaMaquininhaPorDia);
        } else if (formato === 'balanco-sistema') {
          const linhas = parseBalancoSistema(bruto);
          finalizarComLinhas(chave, linhas, arquivo.name, NOTAS_FORMATO[formato]);
        } else if (formato === 'sistema-movimentacoes') {
          const linhas = parseMovimentacoesSistema(bruto);
          finalizarComLinhas(chave, linhas, arquivo.name, NOTAS_FORMATO[formato]);
        } else {
          atualizarFonte(chave, { bruto, arquivo: arquivo.name, carregando: false });
          setMapeamentoForm({ temCabecalho: true, colData: '0', colDescricao: '1', colValor: '2' });
          setMapeando(chave);
        }
      } else if (ext === 'pdf') {
        const buffer = await arquivo.arrayBuffer();
        const linhas = await parsePDF(buffer);
        finalizarComLinhas(chave, linhas, arquivo.name);
      } else if (['txt', 'ret', 'rem'].includes(ext)) {
        const texto = await lerTextoArquivo(arquivo);
        const linhas = parseCNAB240(texto);
        finalizarComLinhas(chave, linhas, arquivo.name);
      } else {
        atualizarFonte(chave, { carregando: false, erro: 'Formato não suportado. Use OFX, CSV, Excel, PDF ou CNAB240 (.txt/.ret).' });
      }
    } catch (e) {
      atualizarFonte(chave, { carregando: false, erro: 'Não consegui ler esse arquivo: ' + e.message });
    }
  };

  const confirmarMapeamento = () => {
    const chave = mapeando;
    const bruto = fontes[chave].bruto;
    const mapeamento = {
      temCabecalho: mapeamentoForm.temCabecalho,
      colData: parseInt(mapeamentoForm.colData, 10),
      colDescricao: parseInt(mapeamentoForm.colDescricao, 10),
      colValor: parseInt(mapeamentoForm.colValor, 10)
    };
    const linhas = normalizarComMapeamento(bruto, mapeamento);
    atualizarFonte(chave, { linhas, bruto: null });
    setMapeando(null);
  };

  const removerFonte = (chave) => {
    setFontes((f) => ({ ...f, [chave]: { ...FONTE_VAZIA } }));
    setResultado(null);
  };

  const editarLinha = (chave, id, campo, valor) => {
    atualizarFonte(chave, {
      linhas: fontes[chave].linhas.map((l) => (l.id === id ? { ...l, [campo]: campo === 'valor' ? parseFloat(valor) || 0 : valor } : l))
    });
    setResultado(null);
  };

  const excluirLinha = (chave, id) => {
    atualizarFonte(chave, { linhas: fontes[chave].linhas.filter((l) => l.id !== id) });
    setResultado(null);
  };

  const adicionarLinhaManual = (chave) => {
    const nova = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      data: new Date().toISOString().slice(0, 10),
      descricao: '',
      valor: 0,
      tipo: 'entrada'
    };
    atualizarFonte(chave, { linhas: [...fontes[chave].linhas, nova] });
  };

  const executarConciliacao = () => {
    const entradasExtrato = fontes.extrato.linhas.filter((l) => l.tipo === 'entrada');
    const saidasExtrato = fontes.extrato.linhas.filter((l) => l.tipo === 'saida');
    const sistemaPix = fontes.sistema.linhas.filter((l) => l.viaPix !== false);
    const sistemaCartao = fontes.sistema.linhas.filter((l) => l.viaCartao === true);
    const sistemaDinheiro = fontes.sistema.linhas.filter((l) => l.viaDinheiro === true);
    const maquininha = fontes.maquininha.linhas;
    // O relatório de Pagamentos já traz Data da venda/Hora da venda e Valor
    // bruto/líquido de cada liquidação — se o Relatório de Vendas separado não
    // foi carregado, usamos as vendas reconstruídas a partir do de Pagamentos
    // (já vêm com dataPagamento/valorLiquidoReal prontos). Se ela carregou o
    // de Vendas mesmo assim (pra conferência extra por Código de Autorização),
    // ligamos os dois pelo código.
    const vendasDeArquivoSeparado = fontes.vendas.linhas.length > 0;
    const vendas = vendasDeArquivoSeparado
      ? ligarVendasComPagamentos(fontes.vendas.linhas, fontes.maquininha.pagamentosDetalhado || [])
      : (fontes.maquininha.vendasDerivadas || []);

    // O extrato define o período sendo conciliado — um lançamento (manual ou
    // conta paga) de outro mês não pode aparecer como "divergência" só porque
    // não está num extrato que nem é do período dele. Damos uma margem de
    // alguns dias pra cobrir compensação bancária perto da virada do mês.
    const MARGEM_DIAS = 5;
    const datasExtrato = fontes.extrato.linhas.map((l) => l.data).filter(Boolean).sort();
    const periodoInicioExtrato = datasExtrato.length > 0
      ? new Date(new Date(datasExtrato[0]).getTime() - MARGEM_DIAS * 86400000).toISOString().slice(0, 10)
      : null;
    const periodoFimExtrato = datasExtrato.length > 0
      ? new Date(new Date(datasExtrato[datasExtrato.length - 1]).getTime() + MARGEM_DIAS * 86400000).toISOString().slice(0, 10)
      : null;
    const dentroDoPeriodoDoExtrato = (dataISO) => {
      if (!periodoInicioExtrato || !periodoFimExtrato || !dataISO) return true;
      return dataISO >= periodoInicioExtrato && dataISO <= periodoFimExtrato;
    };

    const pagamentosApp = contasAPagar
      .filter((c) => c.status === 'Pago')
      .map((c) => {
        const [dia, mes, ano] = c.vencimento.split('/');
        return {
          id: `pago-${c.id}`,
          data: `${ano}-${mes}-${dia}`,
          descricao: c.descricao,
          valor: c.valor,
          tipo: 'saida'
        };
      })
      .filter((c) => dentroDoPeriodoDoExtrato(c.data));

    // Lançamentos manuais já feitos direto no app (aba Visão Geral > Adicionar
    // Crédito/Débito, inclusive os que vieram de uma conciliação anterior) —
    // se já batem com uma linha do extrato, não precisam ser lançados de novo.
    // Só entram aqui os do período do extrato carregado (ver dentroDoPeriodoDoExtrato).
    const lancamentosManuaisEntrada = (movimentacoes || [])
      .filter((m) => m.tipo === 'Crédito Manual')
      .map((m) => ({ id: `manual-mov-${m.id}`, data: paraDataISO(m.data), descricao: m.descricao, valor: m.valor, tipo: 'entrada' }))
      .filter((m) => m.data && dentroDoPeriodoDoExtrato(m.data));

    const lancamentosManuaisSaida = (movimentacoes || [])
      .filter((m) => m.tipo === 'Débito Manual')
      .map((m) => ({ id: `manual-mov-${m.id}`, data: paraDataISO(m.data), descricao: m.descricao, valor: m.valor, tipo: 'saida' }))
      .filter((m) => m.data && dentroDoPeriodoDoExtrato(m.data));

    // Se ela reconciliar o mesmo período de novo (pra conferir algo, por
    // exemplo) e clicar em "Lançar" de novo nesses três lugares — comanda,
    // taxa por dia e recebimento em dinheiro —, sem checar contra o que já
    // existe isso duplicaria a movimentação e inflaria o saldo (diferente do
    // extrato, que já cruza com lancamentosManuaisEntrada/Saida acima). Guarda
    // o que já foi lançado antes pra avisar e não deixar lançar nesses casos.
    const creditosManuaisSicredi = (movimentacoes || [])
      .filter((m) => m.tipo === 'Crédito Manual' && m.conta === 'sicredi')
      .map((m) => ({ normalizado: normalizarParaConferirDuplicata(m.descricao), valor: m.valor }));
    const creditosManuaisCaixa = (movimentacoes || [])
      .filter((m) => m.tipo === 'Crédito Manual' && m.conta === 'caixa')
      .map((m) => ({ normalizado: normalizarParaConferirDuplicata(m.descricao), valor: m.valor }));
    const debitosTaxaMaquininhaSicredi = new Set(
      (movimentacoes || [])
        .filter((m) => m.tipo === 'Débito Manual' && m.conta === 'sicredi' && normalizarParaConferirDuplicata(m.descricao) === 'taxas da maquininha')
        .map((m) => `${paraDataISO(m.data)}|${(Math.round(m.valor * 100) / 100).toFixed(2)}`)
    );

    // Dinheiro não passa pelo banco nem pela maquininha — não tem com o que
    // conciliar, só precisa ser lançado no Caixa manualmente.
    const recebimentosDinheiro = sistemaDinheiro
      .filter((l) => dentroDoPeriodoDoExtrato(l.data))
      .map((l) => ({ ...l, possivelDuplicata: foiLancadoAntes(creditosManuaisCaixa, l.descricao, l.valor) }));

    // Toda comanda do Sistema paga via Pix ou cartão (esteja ou não conciliada
    // com o extrato) — pra lançar o faturamento pelo valor BRUTO (o que o
    // cliente pagou), com a taxa da maquininha entrando como despesa separada.
    const faturamentoBrutoSistema = fontes.sistema.linhas
      .filter((l) => !l.viaDinheiro)
      .filter((l) => dentroDoPeriodoDoExtrato(l.data));

    // Exige que o nome do extrato e o da comanda tenham alguma semelhança pra
    // confirmar um Pix automaticamente — sem esse sinal, fica pendente pra
    // confirmação manual (evita casar a pessoa errada só por valor+data).
    const passo1 = conciliar(entradasExtrato, sistemaPix, 3, { exigirNome: true });
    const passo2 = conciliar(passo1.semParA, maquininha);
    const passo2b = conciliar(passo2.semParA, lancamentosManuaisEntrada);
    const passo3 = conciliar(saidasExtrato, pagamentosApp);
    const passo3b = conciliar(passo3.semParA, lancamentosManuaisSaida);
    const passo4 = conciliar(vendas, sistemaCartao);

    // Prefere a taxa calculada a partir de Pagamentos (inclui antecipação); Vendas
    // só tem o desconto de MDR, então serve de estimativa quando só ele foi carregado.
    const taxaMaquininha = fontes.maquininha.taxaMaquininha ?? fontes.vendas.taxaMaquininha ?? null;
    const taxaMaquininhaPorDia = (fontes.maquininha.taxaMaquininhaPorDia ?? fontes.vendas.taxaMaquininhaPorDia ?? null)?.map((d) => ({
      ...d,
      possivelDuplicata: debitosTaxaMaquininhaSicredi.has(`${d.data}|${(Math.round(d.valor * 100) / 100).toFixed(2)}`)
    })) ?? null;

    // Marca cada comanda do faturamento bruto com o que já foi confirmado: Pix
    // bate direto com uma linha do extrato (passo1); Cartão só dá pra conferir
    // em lote com o Relatório de Vendas da maquininha (passo4), não linha a
    // linha com o banco — mesmo assim já é um sinal melhor que nada.
    const pixConfirmadoIds = new Set(passo1.pares.map((p) => p.b.id));
    const cartaoConfirmadoIds = new Set(passo4.pares.map((p) => p.b.id));
    // Guarda qual linha do extrato foi casada com qual comanda via Pix — se
    // a Fernanda precisar "roubar" essa linha pra outra comanda (porque o
    // casamento automático por valor+data pegou a comanda errada, comum
    // quando duas comandas do mesmo valor caem perto uma da outra), a gente
    // sabe qual comanda desconfirmar.
    const paresPixExtratoSistema = passo1.pares.map((p) => ({ extratoId: p.a.id, sistemaId: p.b.id }));

    // Pra lançar a comanda na data em que o dinheiro realmente caiu na Conta
    // Corrente (não a data da venda) e, na Visão Geral, manter a mesma ordem
    // do extrato/relatório de pagamento entre lançamentos do mesmo dia: guarda
    // a posição de cada linha do extrato e, pro cartão, a data de pagamento +
    // posição no relatório de Pagamentos de cada venda casada (passo4).
    const extratoOrdemPorId = new Map(fontes.extrato.linhas.map((l, i) => [l.id, i]));
    const ordemExtratoPorSistemaId = new Map(
      paresPixExtratoSistema
        .map((p) => [p.sistemaId, extratoOrdemPorId.get(p.extratoId)])
        .filter(([, ordem]) => ordem !== undefined)
    );
    const dataPagamentoPorSistemaId = new Map(
      passo4.pares.filter((p) => p.a.dataPagamento).map((p) => [p.b.id, p.a.dataPagamento])
    );
    const ordemPagamentoPorSistemaId = new Map(
      passo4.pares.filter((p) => p.a.ordemPagamento !== undefined && p.a.ordemPagamento !== null).map((p) => [p.b.id, p.a.ordemPagamento])
    );
    const faturamentoBrutoComStatus = faturamentoBrutoSistema.map((l) => ({
      ...l,
      confirmadoNoBanco: l.viaPix ? pixConfirmadoIds.has(l.id) : (l.viaCartao ? cartaoConfirmadoIds.has(l.id) : true),
      dataPagamento: l.viaCartao ? (dataPagamentoPorSistemaId.get(l.id) ?? null) : null,
      ordemExtrato: l.viaPix ? (ordemExtratoPorSistemaId.get(l.id) ?? null) : null,
      ordemPagamento: l.viaCartao ? (ordemPagamentoPorSistemaId.get(l.id) ?? null) : null,
      possivelDuplicata: foiLancadoAntes(creditosManuaisSicredi, l.descricao, l.valorBruto)
    }));

    // Elo que faltava na cadeia do cartão: hoje o Sistema bate com Vendas
    // (passo4, por valor+data) e o Extrato bate com Pagamentos agrupado por
    // dia (passo2, também por valor+data) — mas nada confere se AQUELA venda
    // específica realmente tem uma liquidação correspondente no relatório de
    // Pagamentos. Quando ela subiu o Relatório de Vendas separado, "vendas" já
    // veio ligado ao de Pagamentos pelo Código de Autorização, lá em cima;
    // quando não subiu, "vendas" já é a lista reconstruída a partir do próprio
    // relatório de Pagamentos, então toda venda conta como confirmada.
    const vendasComPagamento = vendas;

    // "Abre" cada depósito da maquininha (o mesmo valor agrupado que bate com
    // UMA linha do extrato, tipo "SICREDI CREDITO MASTER") nas vendas/parcelas
    // que somadas formam aquele valor — pra ela conferir bruto, taxa e líquido
    // de cada uma, igual ela já faz manualmente comparando extrato x Pagamentos.
    const maquininhaConfirmadoIds = new Set(passo2.pares.map((p) => p.b.id));
    const extratoPorMaquininhaId = new Map(passo2.pares.map((p) => [p.b.id, p.a]));
    const maquininhaPorChaveDeposito = new Map(maquininha.map((m) => [`${m.data}|${m.descricao}`, m]));
    // Uma venda só é rastreável até uma comanda do Sistema se ela também bateu
    // no passo4 (Vendas x Sistema, por valor+horário) E carrega Código de
    // Autorização — sem isso não dá pra saber quem é o cliente daquela venda.
    const comandaPorCodigoAutorizacao = new Map(
      passo4.pares.filter((p) => p.a.codigoAutorizacao).map((p) => [p.a.codigoAutorizacao, p.b.descricao])
    );
    const composicaoDepositos = agruparPagamentosPorDeposito(fontes.maquininha.pagamentosDetalhado || [])
      .map((g) => {
        const maquininhaItem = maquininhaPorChaveDeposito.get(`${g.data}|${g.descricao}`);
        const extratoPareado = maquininhaItem ? extratoPorMaquininhaId.get(maquininhaItem.id) : null;
        return {
          ...g,
          confirmadoNoExtrato: !!maquininhaItem && maquininhaConfirmadoIds.has(maquininhaItem.id),
          extratoDescricao: extratoPareado?.descricao ?? null,
          taxaTotal: Math.round((g.valorBrutoTotal - g.valorLiquidoTotal) * 100) / 100,
          itens: g.itens.map((item) => {
            const comandaEncontrada = item.codigoAutorizacao ? (comandaPorCodigoAutorizacao.get(item.codigoAutorizacao) ?? null) : null;
            return {
              ...item,
              taxa: Math.round((item.valorBruto - item.valorLiquido) * 100) / 100,
              comandaEncontrada,
              possivelDuplicata: comandaEncontrada ? false : foiLancadoAntes(creditosManuaisSicredi, descricaoVendaSemComanda(item), item.valorLiquido)
            };
          })
        };
      })
      .sort((a, b) => a.data.localeCompare(b.data));

    setResultado({
      recebimentos: {
        conciliadoSistema: passo1.pares.length,
        conciliadoMaquininha: passo2.pares.length,
        conciliadoManual: passo2b.pares.length,
        semCorrespondenciaExtrato: passo2b.semParA,
        semCorrespondenciaSistema: passo1.semParB,
        semCorrespondenciaMaquininha: passo2.semParB,
        semCorrespondenciaManual: passo2b.semParB
      },
      pagamentos: {
        conciliado: passo3.pares.length,
        conciliadoManual: passo3b.pares.length,
        semCorrespondenciaExtrato: passo3b.semParA,
        semCorrespondenciaApp: passo3.semParB,
        semCorrespondenciaManual: passo3b.semParB
      },
      vendasCartao: {
        conciliado: passo4.pares.length,
        semCorrespondenciaVendas: passo4.semParA,
        semCorrespondenciaSistema: passo4.semParB
      },
      taxaMaquininha,
      taxaMaquininhaPorDia,
      recebimentosDinheiro,
      faturamentoBrutoSistema: faturamentoBrutoComStatus,
      paresPixExtratoSistema,
      vendasComPagamento,
      vendasDeArquivoSeparado,
      composicaoDepositos
    });
    setIgnorados(new Set());
    setTaxaJaLancada(false);
    setDiasTaxaLancados(new Set());
    setSelecionadosFaturamento(new Set());
    setCasamentoManual(null);
  };

  const marcarIgnorado = (id) => {
    setIgnorados((s) => new Set(s).add(id));
  };

  // Olha os lançamentos já classificados anteriormente com uma descrição
  // parecida (ex: mesmo estabelecimento, ignorando número de referência) e
  // sugere a classificação usada da última vez — se nunca apareceu nada
  // parecido, não sugere nada.
  const sugerirCategoriaPorHistorico = (descricao) => {
    const alvo = normalizarDescricaoParaComparacao(descricao);
    if (alvo.length < 4) return null;
    // Compara por "prefixo em comum" em vez de igualdade exata: o lançamento já
    // salvo carrega sufixos tipo "(lançado da Conciliação)" ou "(parte 1/3 -
    // lançado da Conciliação)" que a linha crua do extrato ainda não tem.
    const candidatos = (movimentacoes || [])
      .filter((m) => m.categoria)
      .map((m) => ({ categoria: m.categoria, normalizado: normalizarDescricaoParaComparacao(m.descricao), dataISO: paraDataISO(m.data) || '' }))
      .filter((m) => m.normalizado.length >= 4 && (m.normalizado.startsWith(alvo) || alvo.startsWith(m.normalizado)))
      .sort((a, b) => b.dataISO.localeCompare(a.dataISO));
    return candidatos.length > 0 ? candidatos[0].categoria : null;
  };

  const lancarMovimentacao = (linha) => {
    const categoriaPadrao = sugerirCategoriaPorHistorico(linha.descricao) ?? (linha.tipo === 'entrada' ? CATEGORIA_PADRAO_RECEBIMENTO : '');
    onLancarMovimentacao({ ...linha, categoria: categoriaPorLinha[linha.id] ?? categoriaPadrao });
    marcarIgnorado(linha.id);
  };

  const lancarNoCaixa = (linha) => {
    if (linha.possivelDuplicata && !window.confirm('Já existe um lançamento no Caixa muito parecido com esse (mesmo valor e descrição) — pode já ter sido lançado numa conciliação anterior. Lançar mesmo assim?')) return;
    const categoriaPadrao = sugerirCategoriaPorHistorico(linha.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO;
    onLancarCaixa({ ...linha, categoria: categoriaPorLinha[linha.id] ?? categoriaPadrao });
    marcarIgnorado(linha.id);
  };

  const lancarFaturamentoBruto = (linha) => {
    if (linha.possivelDuplicata && !window.confirm('Já existe uma Receita muito parecida com essa comanda (mesmo valor e descrição) na Conta Corrente — pode já ter sido lançada numa conciliação anterior. Lançar mesmo assim?')) return;
    const categoria = categoriaPorLinha[linha.id] ?? sugerirCategoriaPorHistorico(linha.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO;
    onLancarFaturamentoBruto([{ ...linha, categoria }]);
    marcarIgnorado(linha.id);
  };

  // Uma venda que passou na maquininha mas não tem comanda no Sistema nunca
  // aparece em "Faturamento Bruto do Sistema" (que só lista o que existe no
  // Sistema) — sem isso, esse dinheiro simplesmente nunca entraria na Conta
  // Corrente do app. Lança o valor LÍQUIDO direto como Receita (não tem bruto
  // de comanda pra separar taxa) na data em que ele realmente caiu no banco.
  const lancarVendaSemComanda = (item, deposito) => {
    const descricao = descricaoVendaSemComanda(item);
    if (item.possivelDuplicata && !window.confirm('Já existe uma Receita muito parecida com essa venda (mesmo valor e descrição) na Conta Corrente — pode já ter sido lançada numa conciliação anterior. Lançar mesmo assim?')) return;
    const categoria = sugerirCategoriaPorHistorico(descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO;
    onLancarMovimentacao({ data: deposito.data, tipo: 'entrada', descricao, valor: item.valorLiquido, categoria });
    marcarIgnorado(item.id);
  };

  const lancarTodasVendasSemComandaDoDeposito = (deposito) => {
    const semComanda = deposito.itens.filter((item) => !item.comandaEncontrada && !ignorados.has(item.id));
    const pendentes = semComanda.filter((item) => !item.possivelDuplicata);
    const duplicatas = semComanda.filter((item) => item.possivelDuplicata);
    if (pendentes.length === 0) {
      if (duplicatas.length > 0) alert('Todas as vendas sem comanda desse depósito parecem já ter sido lançadas antes — nada foi lançado de novo.');
      return;
    }
    pendentes.forEach((item) => {
      const descricao = descricaoVendaSemComanda(item);
      const categoria = sugerirCategoriaPorHistorico(descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO;
      onLancarMovimentacao({ data: deposito.data, tipo: 'entrada', descricao, valor: item.valorLiquido, categoria });
    });
    setIgnorados((s) => {
      const novo = new Set(s);
      pendentes.forEach((item) => novo.add(item.id));
      return novo;
    });
    if (duplicatas.length > 0) {
      alert(`${duplicatas.length} venda(s) ficaram de fora por já parecerem lançadas antes — confira e lance individualmente se precisar mesmo assim.`);
    }
  };

  // Lançar todas de uma vez cria os IDs em sequência (ver handleLancarFaturamentoBruto
  // no App.jsx), e a Visão Geral mostra as mais recentes primeiro, desempatando
  // lançamentos do mesmo dia pelo ID (maior ID aparece mais acima). Pra ela ver, dentro
  // de um mesmo dia, a mesma ordem do extrato (Pix) e depois do relatório de Pagamentos
  // (cartão) de cima pra baixo, quem aparece primeiro no extrato/relatório precisa
  // receber o ID maior — ou seja, precisa ser lançado por último. Por isso ordenamos
  // aqui do ÚLTIMO pro PRIMEIRO (ordem decrescente): o primeiro da lista real vai pro
  // fim da fila de lançamento e sai com o ID mais alto do grupo.
  const ordenarComoNoBancoEnaMaquininha = (lista) => {
    return [...lista].sort((a, b) => {
      const dataA = a.dataPagamento || a.data || '';
      const dataB = b.dataPagamento || b.data || '';
      if (dataA !== dataB) return dataA < dataB ? -1 : 1;
      const ordemExtratoA = a.ordemExtrato ?? -Infinity;
      const ordemExtratoB = b.ordemExtrato ?? -Infinity;
      if (ordemExtratoA !== ordemExtratoB) return ordemExtratoB - ordemExtratoA;
      const ordemPagamentoA = a.ordemPagamento ?? -Infinity;
      const ordemPagamentoB = b.ordemPagamento ?? -Infinity;
      return ordemPagamentoB - ordemPagamentoA;
    });
  };

  const lancarTodoFaturamentoBruto = (apenasConfirmadas = false) => {
    const todasVisiveis = (resultado.faturamentoBrutoSistema || []).filter((l) => !ignorados.has(l.id));
    const semDuplicatas = todasVisiveis.filter((l) => !l.possivelDuplicata);
    const duplicatas = todasVisiveis.filter((l) => l.possivelDuplicata);
    const visiveisNaOrdem = apenasConfirmadas ? semDuplicatas.filter((l) => l.confirmadoNoBanco) : semDuplicatas;
    const visiveis = ordenarComoNoBancoEnaMaquininha(visiveisNaOrdem);
    if (visiveis.length === 0) {
      if (duplicatas.length > 0) alert(`Todas as comandas visíveis parecem já ter sido lançadas antes (mesmo valor e descrição já existem na Conta Corrente) — nada foi lançado de novo. Se alguma dessas realmente precisa ser lançada, use o botão "Lançar" dela individualmente.`);
      return;
    }
    const linhasComCategoria = visiveis.map((l) => ({
      ...l,
      categoria: categoriaPorLinha[l.id] ?? sugerirCategoriaPorHistorico(l.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO
    }));
    onLancarFaturamentoBruto(linhasComCategoria);
    setIgnorados((s) => {
      const novo = new Set(s);
      visiveis.forEach((l) => novo.add(l.id));
      return novo;
    });
    if (duplicatas.length > 0) {
      alert(`${duplicatas.length} comanda(s) ficaram de fora por já parecerem lançadas antes (mesmo valor e descrição já existem na Conta Corrente) — confira e use o botão "Lançar" de cada uma individualmente se precisar mesmo assim.`);
    }
  };

  const criarContaTaxaDiaria = (dia) => {
    if (dia.possivelDuplicata && !window.confirm('Já existe um débito de "Taxas da Maquininha" nesse mesmo dia e valor na Conta Corrente — pode já ter sido lançado numa conciliação anterior. Lançar mesmo assim?')) return;
    onCriarContasTaxaMaquininhaPorDia([dia]);
    setDiasTaxaLancados((s) => new Set(s).add(dia.data));
  };

  const criarTodasContasTaxaDiarias = () => {
    const pendentes = (resultado.taxaMaquininhaPorDia || []).filter((d) => !diasTaxaLancados.has(d.data) && !d.possivelDuplicata);
    const duplicatas = (resultado.taxaMaquininhaPorDia || []).filter((d) => !diasTaxaLancados.has(d.data) && d.possivelDuplicata);
    if (pendentes.length === 0) {
      if (duplicatas.length > 0) alert('Todos os dias visíveis parecem já ter sido lançados antes — nada foi lançado de novo.');
      return;
    }
    onCriarContasTaxaMaquininhaPorDia(pendentes);
    setDiasTaxaLancados((s) => {
      const novo = new Set(s);
      pendentes.forEach((d) => novo.add(d.data));
      return novo;
    });
    if (duplicatas.length > 0) {
      alert(`${duplicatas.length} dia(s) ficaram de fora por já parecerem lançados antes — confira e use o botão de cada dia individualmente se precisar mesmo assim.`);
    }
  };

  const toggleSelecaoFaturamento = (id) => {
    setSelecionadosFaturamento((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  // Às vezes o cliente faz um pagamento só (um Pix, por exemplo) que no Cash
  // Barber vira dois ou mais lançamentos separados (ex: assinatura + comanda
  // avulsa) — nosso casamento automático não sabe somar vários pra bater com
  // um só do extrato. Aqui a Fernanda escolhe manualmente quais comandas
  // formam esse pagamento; a gente soma e tenta confirmar contra o extrato.
  const agruparEConfirmarFaturamento = () => {
    const linhas = (resultado.faturamentoBrutoSistema || []).filter((l) => selecionadosFaturamento.has(l.id) && !ignorados.has(l.id));
    if (linhas.length < 2) return;
    const somaBruto = Math.round(linhas.reduce((s, l) => s + l.valorBruto, 0) * 100) / 100;
    const candidato = (fontes.extrato.linhas || []).find((e) => e.tipo === 'entrada' && Math.abs(e.valor - somaBruto) < 0.01);

    const confirmar = candidato
      ? true
      : window.confirm(`Não achei no extrato nenhuma entrada de ${formatarMoeda(somaBruto)} (a soma das ${linhas.length} comandas selecionadas). Confirmar esse agrupamento mesmo assim, porque você já verificou manualmente?`);

    if (!confirmar) return;

    setResultado((r) => ({
      ...r,
      faturamentoBrutoSistema: r.faturamentoBrutoSistema.map((l) =>
        selecionadosFaturamento.has(l.id) ? { ...l, confirmadoNoBanco: true } : l
      )
    }));
    setSelecionadosFaturamento(new Set());
    if (candidato) {
      alert(`Confirmado! A soma de ${formatarMoeda(somaBruto)} bate com o lançamento de ${formatarDataBR(candidato.data)} no extrato.`);
    }
  };

  // Casamento manual bidirecional: parte de UM item de um lado (uma comanda
  // pendente, ou um lançamento do extrato sem correspondência) e deixa
  // escolher QUANTOS itens do outro lado juntos formam aquele pagamento —
  // cobre tanto "uma comanda paga em duas transferências" quanto "duas
  // comandas pagas com uma transferência só".
  const iniciarCasamentoDeComanda = (comandaId) => {
    setCasamentoManual((c) => (c?.lado === 'comanda' && c.id === comandaId ? null : { lado: 'comanda', id: comandaId, selecionados: new Set() }));
    setMostrarJaCasados(false);
  };

  const iniciarCasamentoDeExtrato = (extratoId) => {
    setCasamentoManual((c) => (c?.lado === 'extrato' && c.id === extratoId ? null : { lado: 'extrato', id: extratoId, selecionados: new Set() }));
    setMostrarJaCasados(false);
  };

  // Mesma mecânica, pra uma Venda que não achou correspondência automática no
  // relatório de Pagamentos (pelo Código de Autorização) — deixa escolher
  // manualmente qual(is) linha(s) do Pagamentos formam aquela venda.
  const iniciarCasamentoDeVenda = (vendaId) => {
    setCasamentoManual((c) => (c?.lado === 'venda' && c.id === vendaId ? null : { lado: 'venda', id: vendaId, selecionados: new Set() }));
    setMostrarJaCasados(false);
  };

  const cancelarCasamentoManual = () => { setCasamentoManual(null); setMostrarJaCasados(false); };

  const toggleCasamentoManual = (id) => {
    setCasamentoManual((c) => {
      if (!c) return c;
      const novo = new Set(c.selecionados);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return { ...c, selecionados: novo };
    });
  };

  const confirmarCasamentoManual = () => {
    if (!casamentoManual || casamentoManual.selecionados.size === 0) return;
    if (casamentoManual.lado === 'comanda') {
      // A comanda em questão é confirmada; os lançamentos do extrato
      // selecionados somem da lista de pendências (o dinheiro deles já está
      // explicado pela comanda, que vai virar Receita no Faturamento Bruto).
      // Se algum dos selecionados já tinha sido casado automaticamente com
      // OUTRA comanda (mesmo valor, data próxima — comum com R$52,00, por
      // exemplo), essa outra comanda volta a ficar pendente, porque a linha
      // do extrato dela na verdade era essa que a Fernanda escolheu agora.
      const paresPix = resultado.paresPixExtratoSistema || [];
      const sistemaIdsParaDesconfirmar = new Set(
        [...casamentoManual.selecionados]
          .map((extratoId) => paresPix.find((p) => p.extratoId === extratoId)?.sistemaId)
          .filter(Boolean)
      );
      setResultado((r) => ({
        ...r,
        faturamentoBrutoSistema: r.faturamentoBrutoSistema.map((x) => {
          if (x.id === casamentoManual.id) return { ...x, confirmadoNoBanco: true };
          if (sistemaIdsParaDesconfirmar.has(x.id)) return { ...x, confirmadoNoBanco: false };
          return x;
        })
      }));
      setIgnorados((s) => {
        const novo = new Set(s);
        casamentoManual.selecionados.forEach((id) => novo.add(id));
        return novo;
      });
      if (sistemaIdsParaDesconfirmar.size > 0) {
        alert('Atenção: uma ou mais linhas selecionadas já estavam casadas automaticamente com outra comanda — ela(s) voltaram a ficar "Pendente" pra você conferir com o que realmente bate.');
      }
    } else if (casamentoManual.lado === 'extrato') {
      // O lançamento do extrato some da lista de pendências (não precisa
      // lançar ele direto); as comandas selecionadas ficam confirmadas. Se
      // alguma comanda selecionada já estava casada automaticamente com
      // OUTRO lançamento do extrato (Pix de mesmo valor, comum com preços
      // fechados), esse outro lançamento volta a aparecer como "sem
      // correspondência", porque a comanda dele na verdade é essa que a
      // Fernanda escolheu agora.
      const paresPix = resultado.paresPixExtratoSistema || [];
      const extratoIdsParaLiberar = [...casamentoManual.selecionados]
        .map((sistemaId) => paresPix.find((p) => p.sistemaId === sistemaId)?.extratoId)
        .filter((id) => id && id !== casamentoManual.id);
      const linhasLiberadas = extratoIdsParaLiberar
        .map((id) => (fontes.extrato.linhas || []).find((l) => l.id === id))
        .filter(Boolean);

      setResultado((r) => ({
        ...r,
        faturamentoBrutoSistema: r.faturamentoBrutoSistema.map((x) =>
          casamentoManual.selecionados.has(x.id) ? { ...x, confirmadoNoBanco: true } : x
        ),
        recebimentos: {
          ...r.recebimentos,
          semCorrespondenciaExtrato: [
            ...r.recebimentos.semCorrespondenciaExtrato,
            ...linhasLiberadas.filter((l) => !r.recebimentos.semCorrespondenciaExtrato.some((x) => x.id === l.id))
          ]
        }
      }));
      setIgnorados((s) => new Set(s).add(casamentoManual.id));
      if (linhasLiberadas.length > 0) {
        alert('Atenção: uma ou mais comandas selecionadas já estavam casadas automaticamente com outro lançamento do extrato — ele(s) voltaram a aparecer como "sem correspondência" pra você conferir com o que realmente bate.');
      }
    } else if (casamentoManual.lado === 'venda') {
      // A venda selecionada passa a contar como encontrada em Pagamentos, com
      // o bruto/líquido/taxa reais somados das linhas escolhidas; essas linhas
      // saem do estoque de candidatos (via "ignorados") pra não serem
      // oferecidas de novo pra outra venda.
      const pagamentosDetalhado = fontes.maquininha.pagamentosDetalhado || [];
      const selecionados = pagamentosDetalhado.filter((p) => casamentoManual.selecionados.has(p.id));
      const valorBrutoPago = Math.round(selecionados.reduce((s, p) => s + p.valorBruto, 0) * 100) / 100;
      const valorLiquidoReal = Math.round(selecionados.reduce((s, p) => s + p.valorLiquido, 0) * 100) / 100;
      setResultado((r) => ({
        ...r,
        vendasComPagamento: r.vendasComPagamento.map((v) =>
          v.id === casamentoManual.id
            ? { ...v, encontradoEmPagamentos: true, valorBrutoPago, valorLiquidoReal, taxaReal: Math.round((valorBrutoPago - valorLiquidoReal) * 100) / 100 }
            : v
        )
      }));
      setIgnorados((s) => {
        const novo = new Set(s);
        casamentoManual.selecionados.forEach((id) => novo.add(id));
        return novo;
      });
    }
    setCasamentoManual(null);
  };

  const renderPainelCasamentoManual = (valorAlvo, descricaoAlvo, candidatos, ocultos = 0) => {
    const selecionados = candidatos.filter((c) => casamentoManual.selecionados.has(c.id));
    const soma = Math.round(selecionados.reduce((s, c) => s + (c.valorBruto ?? c.valor), 0) * 100) / 100;
    const bate = Math.abs(soma - valorAlvo) < 0.01;
    return (
      <div className="mapeamento" style={{ width: '100%' }}>
        <p className="nota-formato">
          Selecione o(s) lançamento(s) que juntos formam "{descricaoAlvo}" ({formatarMoeda(valorAlvo)}).
        </p>
        {ocultos > 0 && (
          <p className="nota-formato">
            {ocultos} lançamento(s) que já bateram com outra coisa não aparecem aqui.{' '}
            <button onClick={() => setMostrarJaCasados(true)} className="btn-editar" style={{ padding: '2px 8px' }}>
              Mostrar mesmo assim (caso algum esteja casado com o lançamento errado)
            </button>
          </p>
        )}
        {candidatos.length === 0 ? (
          <p className="nota-formato">Não sobrou nenhum lançamento sem correspondência pra escolher.</p>
        ) : (
          candidatos.map((c) => {
            const outraComanda = c.usadoPorSistemaId
              ? (resultado.faturamentoBrutoSistema || []).find((x) => x.id === c.usadoPorSistemaId)
              : null;
            const jaConfirmada = !outraComanda && c.confirmadoNoBanco === true;
            return (
              <div key={c.id} className="item-conta" style={{ padding: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={casamentoManual.selecionados.has(c.id)}
                  onChange={() => toggleCasamentoManual(c.id)}
                  style={{ marginRight: 10, width: 18, height: 18 }}
                />
                <div className="info-conta">
                  <p className="desc">
                    {c.descricao}
                    {outraComanda && (
                      <span style={{ color: '#c0862e' }}> — já casado automaticamente com "{outraComanda.descricao}"; selecionar aqui libera ela de novo</span>
                    )}
                    {jaConfirmada && (
                      <span style={{ color: '#c0862e' }}> — já confirmada com outro lançamento do extrato; selecionar aqui libera ele de novo</span>
                    )}
                  </p>
                  <p className="venc">{formatarDataBR(c.data)}</p>
                </div>
                <p className="valor-conta">{formatarMoeda(c.valorBruto ?? c.valor)}</p>
              </div>
            );
          })
        )}
        <p className="venc">
          Soma selecionada: {formatarMoeda(soma)} de {formatarMoeda(valorAlvo)}
          {!bate && selecionados.length > 0 && <span style={{ color: '#c0392b' }}> — ainda não bate</span>}
        </p>
        <div className="acoes" style={{ marginTop: 8 }}>
          <button onClick={confirmarCasamentoManual} disabled={selecionados.length === 0} className="btn-salvar">
            {bate ? 'Confirmar Casamento' : 'Confirmar Mesmo Assim'}
          </button>
          <button onClick={cancelarCasamentoManual} className="btn-cancelar">Cancelar</button>
        </div>
      </div>
    );
  };

  // Uma linha do extrato às vezes mistura mais de uma classificação (ex: uma
  // compra no mercado com material de limpeza, bebidas e insumos de lanche
  // no mesmo débito) — divide o valor total em várias partes, cada uma com
  // sua própria categoria, sem perder o valor exato que caiu no banco.
  const iniciarDivisao = (linha) => {
    setDividindo(linha.id);
    setPartesDivisao([{ valor: '', categoria: '' }, { valor: '', categoria: '' }]);
  };

  const cancelarDivisao = () => {
    setDividindo(null);
    setPartesDivisao([]);
  };

  const atualizarParte = (indice, campo, valor) => {
    setPartesDivisao((partes) => partes.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  };

  const adicionarParte = () => {
    setPartesDivisao((partes) => [...partes, { valor: '', categoria: '' }]);
  };

  const removerParte = (indice) => {
    setPartesDivisao((partes) => partes.filter((_, i) => i !== indice));
  };

  const confirmarDivisao = (linha) => {
    const partes = partesDivisao.map((p) => ({ valor: parseFloat(p.valor) || 0, categoria: p.categoria }));
    const somaCentavos = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100);
    const totalCentavos = Math.round(linha.valor * 100);
    if (somaCentavos !== totalCentavos || partes.some((p) => !(p.valor > 0) || !p.categoria)) return;
    onDividirLancamento(linha, partes);
    marcarIgnorado(linha.id);
    cancelarDivisao();
  };

  const temAlgumaFonte = Object.values(fontes).some((f) => f.linhas.length > 0);

  const renderUpload = (chave) => {
    const fonte = fontes[chave];
    return (
      <div className="card" key={chave}>
        <h3>{LABELS_FONTE[chave]}</h3>

        {fonte.linhas.length === 0 && !fonte.carregando && mapeando !== chave && (
          <div className="upload-box">
            <input
              type="file"
              accept=".ofx,.csv,.xlsx,.xls,.pdf,.txt,.ret,.rem"
              onChange={(e) => handleArquivo(chave, e.target.files[0])}
            />
            <p className="upload-dica">Aceita OFX, CSV, Excel, PDF ou CNAB240 (.txt/.ret)</p>
          </div>
        )}

        {fonte.carregando && <p>Lendo arquivo...</p>}
        {fonte.erro && <p className="erro-arquivo">{fonte.erro}</p>}

        {mapeando === chave && fonte.bruto && (
          <div className="mapeamento">
            <p>Confirme qual coluna é qual (mostrando as primeiras linhas):</p>
            <div className="tabela-scroll">
              <table className="tabela">
                <tbody>
                  {fonte.bruto.slice(0, 5).map((linha, i) => (
                    <tr key={i}>
                      {linha.map((cel, j) => (
                        <td key={j}>{String(cel)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-transferencia">
              <div className="input-group">
                <label>Coluna da Data</label>
                <select value={mapeamentoForm.colData} onChange={(e) => setMapeamentoForm({ ...mapeamentoForm, colData: e.target.value })}>
                  {fonte.bruto[0].map((_, i) => (
                    <option key={i} value={i}>Coluna {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Coluna da Descrição</label>
                <select value={mapeamentoForm.colDescricao} onChange={(e) => setMapeamentoForm({ ...mapeamentoForm, colDescricao: e.target.value })}>
                  {fonte.bruto[0].map((_, i) => (
                    <option key={i} value={i}>Coluna {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Coluna do Valor</label>
                <select value={mapeamentoForm.colValor} onChange={(e) => setMapeamentoForm({ ...mapeamentoForm, colValor: e.target.value })}>
                  {fonte.bruto[0].map((_, i) => (
                    <option key={i} value={i}>Coluna {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>
                  <input
                    type="checkbox"
                    checked={mapeamentoForm.temCabecalho}
                    onChange={(e) => setMapeamentoForm({ ...mapeamentoForm, temCabecalho: e.target.checked })}
                  />{' '}
                  Primeira linha é cabeçalho
                </label>
              </div>
            </div>
            <button onClick={confirmarMapeamento} className="btn-transferir">Processar</button>
          </div>
        )}

        {fonte.linhas.length > 0 && (
          <div>
            {fonte.nota && <p className="nota-formato">✓ {fonte.nota}</p>}
            <p className="upload-dica">{fonte.arquivo} — {fonte.linhas.length} lançamento(s). Revise e corrija antes de conciliar:</p>
            <div className="tabela-scroll">
              <table className="tabela">
                <tbody>
                  {fonte.linhas.map((linha) => (
                    <tr key={linha.id}>
                      <td><input type="date" value={linha.data || ''} onChange={(e) => editarLinha(chave, linha.id, 'data', e.target.value)} /></td>
                      <td><input type="text" value={linha.descricao} onChange={(e) => editarLinha(chave, linha.id, 'descricao', e.target.value)} /></td>
                      <td>
                        <select value={linha.tipo} onChange={(e) => editarLinha(chave, linha.id, 'tipo', e.target.value)}>
                          <option value="entrada">Entrada</option>
                          <option value="saida">Saída</option>
                        </select>
                      </td>
                      <td><input type="number" value={linha.valor} onChange={(e) => editarLinha(chave, linha.id, 'valor', e.target.value)} /></td>
                      <td><button onClick={() => excluirLinha(chave, linha.id)} className="btn-excluir">Excluir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="acoes" style={{ marginTop: 10 }}>
              <button onClick={() => adicionarLinhaManual(chave)} className="btn-editar">+ Adicionar linha</button>
              <button onClick={() => removerFonte(chave)} className="btn-cancelar">Trocar arquivo</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDivergencias = (titulo, lista, origemLabel, permitirCasarComSistema = false) => {
    const visiveis = lista.filter((l) => !ignorados.has(l.id));
    if (visiveis.length === 0) return null;
    return (
      <div>
        <p className="venc" style={{ marginBottom: 8 }}>{titulo}</p>
        {visiveis.map((l) => (
          <div key={l.id} className={`item-conta divergencia-item ${l.tipo === 'saida' ? 'divergencia-saida' : 'divergencia-entrada'}`}>
            <div className="info-conta">
              <p className="desc">{l.descricao} <span className="origem-tag">({origemLabel})</span></p>
              <p className="venc">{formatarDataBR(l.data)}</p>
            </div>
            <p className="valor-conta">{formatarMoeda(l.valor)}</p>
            <div className="acoes">
              {origemLabel === 'Extrato' && (
                <>
                  <CategoriaSelect
                    categorias={categorias || []}
                    value={categoriaPorLinha[l.id] ?? sugerirCategoriaPorHistorico(l.descricao) ?? (l.tipo === 'entrada' ? CATEGORIA_PADRAO_RECEBIMENTO : '')}
                    onChange={(valor) => setCategoriaPorLinha((c) => ({ ...c, [l.id]: valor }))}
                  />
                  <button onClick={() => lancarMovimentacao(l)} className="btn-pagar">Lançar na Conta Corrente</button>
                  <button onClick={() => (dividindo === l.id ? cancelarDivisao() : iniciarDivisao(l))} className="btn-editar">
                    {dividindo === l.id ? 'Cancelar Divisão' : 'Dividir em Categorias'}
                  </button>
                  {permitirCasarComSistema && l.tipo === 'entrada' && (
                    <button onClick={() => iniciarCasamentoDeExtrato(l.id)} className="btn-editar">
                      {casamentoManual?.lado === 'extrato' && casamentoManual.id === l.id ? 'Cancelar Casamento' : 'Casar com Comandas do Sistema'}
                    </button>
                  )}
                </>
              )}
              <button onClick={() => marcarIgnorado(l.id)} className="btn-editar">Ignorar</button>
            </div>
            {casamentoManual?.lado === 'extrato' && casamentoManual.id === l.id &&
              (() => {
                const todos = (resultado.faturamentoBrutoSistema || []).filter((c) => !ignorados.has(c.id));
                const visiveis = mostrarJaCasados ? todos : todos.filter((c) => !c.confirmadoNoBanco);
                const ocultos = todos.length - visiveis.length;
                return renderPainelCasamentoManual(l.valor, l.descricao, visiveis, ocultos);
              })()}
            {dividindo === l.id && (() => {
              const somaCentavos = Math.round(partesDivisao.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0) * 100);
              const totalCentavos = Math.round(l.valor * 100);
              const bate = somaCentavos === totalCentavos;
              return (
                <div className="mapeamento" style={{ width: '100%' }}>
                  <p className="nota-formato">
                    Divida os {formatarMoeda(l.valor)} de "{l.descricao}" entre as classificações — a soma das partes precisa bater exatamente com o valor total.
                  </p>
                  {partesDivisao.map((parte, i) => (
                    <div key={i} className="form-transferencia" style={{ marginBottom: 8 }}>
                      <div className="input-group">
                        <label>Valor</label>
                        <input
                          type="number"
                          step="0.01"
                          value={parte.valor}
                          onChange={(e) => atualizarParte(i, 'valor', e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="input-group">
                        <label>Classificação</label>
                        <CategoriaSelect
                          categorias={categorias || []}
                          value={parte.categoria}
                          onChange={(valor) => atualizarParte(i, 'categoria', valor)}
                        />
                      </div>
                      {partesDivisao.length > 1 && (
                        <button onClick={() => removerParte(i)} className="btn-excluir">Remover</button>
                      )}
                    </div>
                  ))}
                  <div className="acoes" style={{ marginBottom: 8 }}>
                    <button onClick={adicionarParte} className="btn-editar">+ Adicionar parte</button>
                  </div>
                  <p className="venc">
                    Soma das partes: {formatarMoeda(partesDivisao.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0))} de {formatarMoeda(l.valor)}
                    {!bate && <span style={{ color: '#c0392b' }}> — ainda não bate</span>}
                  </p>
                  <div className="acoes" style={{ marginTop: 8 }}>
                    <button
                      onClick={() => confirmarDivisao(l)}
                      disabled={!bate || partesDivisao.some((p) => !(parseFloat(p.valor) > 0) || !p.categoria)}
                      className="btn-salvar"
                    >
                      Confirmar Divisão
                    </button>
                    <button onClick={cancelarDivisao} className="btn-cancelar">Cancelar</button>
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    );
  };

  const renderFaturamentoBruto = () => {
    const visiveis = (resultado.faturamentoBrutoSistema || []).filter((l) => !ignorados.has(l.id));
    if (visiveis.length === 0) return null;
    const totalBruto = visiveis.reduce((s, l) => s + l.valorBruto, 0);
    const totalTaxa = visiveis.reduce((s, l) => s + (l.taxa || 0), 0);
    const confirmadas = visiveis.filter((l) => l.confirmadoNoBanco).length;
    return (
      <div className="card">
        {renderTituloSecao('Faturamento Bruto do Sistema', 'faturamentoBruto')}
        {!secoesRecolhidas.has('faturamentoBruto') && (
        <>
        <p className="nota-formato">
          Essas comandas do Sistema (Pix e Cartão) ainda não viraram Receita no app — mesmo as que já conciliaram com o extrato. Cada uma lança o valor BRUTO (o que o cliente pagou) como Receita e, quando teve taxa de maquininha, a taxa entra separada como Despesa — o efeito no saldo da Conta Corrente é igual ao valor líquido que realmente caiu no banco.
        </p>
        <p className="nota-formato">
          <strong>✓ Confirmado</strong> = essa comanda já bateu com o extrato (Pix) ou com as vendas da maquininha, seja do Relatório de Vendas separado ou reconstruídas a partir do de Pagamentos (Cartão). <strong>⏳ Pendente</strong> = o Cash Barber diz que foi pago, mas ainda não achamos correspondência no banco/maquininha nesse período — pode ser só atraso de compensação, vale conferir antes de lançar.
        </p>
        <div className="resumo-grid">
          <div className="resumo-item">
            <p>Comandas</p>
            <p className="valor-resumo">{visiveis.length}</p>
          </div>
          <div className="resumo-item">
            <p>Confirmadas / Pendentes</p>
            <p className="valor-resumo">{confirmadas} / {visiveis.length - confirmadas}</p>
          </div>
          <div className="resumo-item">
            <p>Total Bruto</p>
            <p className="valor-resumo">{formatarMoeda(totalBruto)}</p>
          </div>
          <div className="resumo-item">
            <p>Total em Taxas</p>
            <p className="valor-resumo">{formatarMoeda(totalTaxa)}</p>
          </div>
        </div>
        <div className="acoes" style={{ margin: '10px 0' }}>
          <button onClick={() => lancarTodoFaturamentoBruto(false)} className="btn-transferir">Lançar Faturamento de Todas as Comandas</button>
          {confirmadas > 0 && confirmadas < visiveis.length && (
            <button onClick={() => lancarTodoFaturamentoBruto(true)} className="btn-editar">Lançar Só as Confirmadas ({confirmadas})</button>
          )}
        </div>
        <p className="nota-formato">
          Quando um cliente faz um pagamento só (ex: um Pix) que no Cash Barber virou dois ou mais lançamentos (ex: assinatura + comanda), marque a caixinha das comandas envolvidas — a gente soma e confirma o grupo contra o extrato.
        </p>
        {(() => {
          const selecionadasVisiveis = visiveis.filter((l) => selecionadosFaturamento.has(l.id));
          if (selecionadasVisiveis.length < 2) return null;
          return (
            <div className="acoes" style={{ marginBottom: 10 }}>
              <button onClick={agruparEConfirmarFaturamento} className="btn-pagar">
                Agrupar e Confirmar {selecionadasVisiveis.length} Selecionadas (soma {formatarMoeda(selecionadasVisiveis.reduce((s, l) => s + l.valorBruto, 0))})
              </button>
              <button onClick={() => setSelecionadosFaturamento(new Set())} className="btn-cancelar">Limpar Seleção</button>
            </div>
          );
        })()}
        {visiveis.map((l) => (
          <div key={l.id} className="item-conta divergencia-item divergencia-entrada">
            <input
              type="checkbox"
              checked={selecionadosFaturamento.has(l.id)}
              onChange={() => toggleSelecaoFaturamento(l.id)}
              style={{ marginRight: 10, width: 18, height: 18 }}
            />
            <div className="info-conta">
              <p className="desc">
                {l.descricao} <span className="origem-tag">(Sistema)</span>{' '}
                {l.confirmadoNoBanco ? (
                  <span className="badge-categoria" style={{ color: '#27ae60' }}>✓ Confirmado {l.viaPix ? 'no extrato' : 'na maquininha'}</span>
                ) : (
                  <span className="badge-categoria" style={{ color: '#c0862e' }}>⏳ Pendente {l.viaPix ? 'no extrato' : 'na maquininha'}</span>
                )}
                {l.possivelDuplicata && (
                  <span className="badge-categoria" style={{ color: '#c0392b' }}> ⚠️ Parece já lançada antes</span>
                )}
              </p>
              <p className="venc">
                {formatarDataBR(l.data)}
                {l.taxa > 0 && ` — taxa ${formatarMoeda(l.taxa)} (R$ ${l.valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} líquido no banco)`}
              </p>
            </div>
            <p className="valor-conta">{formatarMoeda(l.valorBruto)}</p>
            <div className="acoes">
              <CategoriaSelect
                categorias={categorias || []}
                value={categoriaPorLinha[l.id] ?? sugerirCategoriaPorHistorico(l.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO}
                onChange={(valor) => setCategoriaPorLinha((c) => ({ ...c, [l.id]: valor }))}
              />
              <button onClick={() => lancarFaturamentoBruto(l)} className="btn-pagar">Lançar</button>
              {!l.confirmadoNoBanco && (
                <button onClick={() => iniciarCasamentoDeComanda(l.id)} className="btn-editar">
                  {casamentoManual?.lado === 'comanda' && casamentoManual.id === l.id ? 'Cancelar Casamento' : 'Casar com Lançamentos do Extrato'}
                </button>
              )}
              <button onClick={() => marcarIgnorado(l.id)} className="btn-editar">Ignorar</button>
            </div>
            {casamentoManual?.lado === 'comanda' && casamentoManual.id === l.id &&
              (() => {
                const paresPix = resultado.paresPixExtratoSistema || [];
                const todos = (fontes.extrato.linhas || [])
                  .filter((e) => e.tipo === 'entrada' && !ignorados.has(e.id))
                  .map((e) => ({ ...e, usadoPorSistemaId: paresPix.find((p) => p.extratoId === e.id)?.sistemaId || null }));
                const visiveis = mostrarJaCasados ? todos : todos.filter((e) => !e.usadoPorSistemaId);
                const ocultos = todos.length - visiveis.length;
                return renderPainelCasamentoManual(l.valorBruto, l.descricao, visiveis, ocultos);
              })()}
          </div>
        ))}
        </>
        )}
      </div>
    );
  };

  const renderRecebimentosDinheiro = () => {
    const visiveis = (resultado.recebimentosDinheiro || []).filter((l) => !ignorados.has(l.id));
    if (visiveis.length === 0) return null;
    return (
      <div className="card">
        {renderTituloSecao('Recebido em Dinheiro (Sistema)', 'dinheiro')}
        {!secoesRecolhidas.has('dinheiro') && (
        <>
        <p className="nota-formato">
          Esses recebimentos não passam pelo banco nem pela maquininha, então não têm com o que conciliar — lance direto no Caixa pra atualizar o saldo.
        </p>
        {visiveis.map((l) => (
          <div key={l.id} className="item-conta divergencia-item divergencia-entrada">
            <div className="info-conta">
              <p className="desc">
                {l.descricao} <span className="origem-tag">(Sistema)</span>
                {l.possivelDuplicata && (
                  <span className="badge-categoria" style={{ color: '#c0392b' }}> ⚠️ Parece já lançada antes</span>
                )}
              </p>
              <p className="venc">{formatarDataBR(l.data)}</p>
            </div>
            <p className="valor-conta">{formatarMoeda(l.valor)}</p>
            <div className="acoes">
              <CategoriaSelect
                categorias={categorias || []}
                value={categoriaPorLinha[l.id] ?? sugerirCategoriaPorHistorico(l.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO}
                onChange={(valor) => setCategoriaPorLinha((c) => ({ ...c, [l.id]: valor }))}
              />
              <button onClick={() => lancarNoCaixa(l)} className="btn-pagar">Lançar no Caixa</button>
              <button onClick={() => marcarIgnorado(l.id)} className="btn-editar">Ignorar</button>
            </div>
          </div>
        ))}
        </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="card">
        <h3>Conciliação Bancária</h3>
        <p>Envie o extrato do banco e, se tiver, o relatório do sistema e/ou da maquininha. O app tenta casar os lançamentos automaticamente e mostra o que não bateu.</p>
        <p className="upload-dica">Nos lançamentos do extrato sem correspondência, use "Lançar na Conta Corrente" pra registrar de verdade no app (atualiza o saldo do Sicredi) — é como o app fica sabendo de dinheiro que entrou ou saiu e ele ainda não tinha registrado.</p>
      </div>

      {renderUpload('extrato')}
      {renderUpload('sistema')}
      {renderUpload('maquininha')}
      {renderUpload('vendas')}

      {temAlgumaFonte && (
        <div className="card">
          <button onClick={executarConciliacao} className="btn-transferir" disabled={fontes.extrato.linhas.length === 0}>
            Conciliar
          </button>
          {fontes.extrato.linhas.length === 0 && <p className="upload-dica">É preciso pelo menos o extrato bancário para conciliar.</p>}
        </div>
      )}

      {resultado && (
        <>
          <div className="card">
            {renderTituloSecao('Recebimentos', 'recebimentos')}
            {!secoesRecolhidas.has('recebimentos') && (
            <>
            <div className="resumo-grid">
              <div className="resumo-item">
                <p>Conciliado c/ Sistema</p>
                <p className="valor-resumo">{resultado.recebimentos.conciliadoSistema}</p>
              </div>
              <div className="resumo-item">
                <p>Conciliado c/ Maquininha</p>
                <p className="valor-resumo">{resultado.recebimentos.conciliadoMaquininha}</p>
              </div>
              <div className="resumo-item">
                <p>Já lançado manualmente</p>
                <p className="valor-resumo">{resultado.recebimentos.conciliadoManual}</p>
              </div>
            </div>
            <div style={{ marginTop: 15 }}>
              {renderDivergencias('Entradas no extrato sem correspondência:', resultado.recebimentos.semCorrespondenciaExtrato, 'Extrato', true)}
              {renderDivergencias('No Sistema mas não achado no extrato:', resultado.recebimentos.semCorrespondenciaSistema, 'Sistema')}
              {renderDivergencias('Na Maquininha mas não achado no extrato:', resultado.recebimentos.semCorrespondenciaMaquininha, 'Maquininha')}
              {renderDivergencias('Lançado manualmente no app mas não achado no extrato:', resultado.recebimentos.semCorrespondenciaManual, 'Lançamento Manual')}
              {resultado.recebimentos.semCorrespondenciaExtrato.filter(l => !ignorados.has(l.id)).length === 0 &&
                resultado.recebimentos.semCorrespondenciaSistema.filter(l => !ignorados.has(l.id)).length === 0 &&
                resultado.recebimentos.semCorrespondenciaMaquininha.filter(l => !ignorados.has(l.id)).length === 0 &&
                resultado.recebimentos.semCorrespondenciaManual.filter(l => !ignorados.has(l.id)).length === 0 && (
                <p>✅ Tudo conciliado.</p>
              )}
            </div>
            </>
            )}
          </div>

          {renderFaturamentoBruto()}

          {renderRecebimentosDinheiro()}

          <div className="card">
            {renderTituloSecao('Pagamentos', 'pagamentos')}
            {!secoesRecolhidas.has('pagamentos') && (
            <>
            <div className="resumo-grid">
              <div className="resumo-item">
                <p>Conciliado c/ Contas Pagas</p>
                <p className="valor-resumo">{resultado.pagamentos.conciliado}</p>
              </div>
              <div className="resumo-item">
                <p>Já lançado manualmente</p>
                <p className="valor-resumo">{resultado.pagamentos.conciliadoManual}</p>
              </div>
            </div>
            <div style={{ marginTop: 15 }}>
              {renderDivergencias('Saídas no extrato sem conta paga correspondente:', resultado.pagamentos.semCorrespondenciaExtrato, 'Extrato')}
              {renderDivergencias('Marcado como pago no app mas não achado no extrato:', resultado.pagamentos.semCorrespondenciaApp, 'Contas a Pagar')}
              {renderDivergencias('Lançado manualmente no app mas não achado no extrato:', resultado.pagamentos.semCorrespondenciaManual, 'Lançamento Manual')}
              {resultado.pagamentos.semCorrespondenciaExtrato.filter(l => !ignorados.has(l.id)).length === 0 &&
                resultado.pagamentos.semCorrespondenciaApp.filter(l => !ignorados.has(l.id)).length === 0 &&
                resultado.pagamentos.semCorrespondenciaManual.filter(l => !ignorados.has(l.id)).length === 0 && (
                <p>✅ Tudo conciliado.</p>
              )}
            </div>
            </>
            )}
          </div>

          {fontes.vendas.linhas.length > 0 && (
            <div className="card">
              {renderTituloSecao('Vendas no Cartão vs. Sistema', 'vendasCartao')}
              {!secoesRecolhidas.has('vendasCartao') && (
              <>
              <p className="upload-dica">Compara o valor bruto de cada venda no cartão com a comanda correspondente no seu sistema.</p>
              <div className="resumo-grid">
                <div className="resumo-item">
                  <p>Conciliado</p>
                  <p className="valor-resumo">{resultado.vendasCartao.conciliado}</p>
                </div>
              </div>
              <div style={{ marginTop: 15 }}>
                {renderDivergencias('Vendas no cartão sem comanda correspondente no sistema:', resultado.vendasCartao.semCorrespondenciaVendas, 'Maquininha')}
                {renderDivergencias('Comanda paga no cartão sem venda correspondente na maquininha:', resultado.vendasCartao.semCorrespondenciaSistema, 'Sistema')}
                {resultado.vendasCartao.semCorrespondenciaVendas.filter(l => !ignorados.has(l.id)).length === 0 &&
                  resultado.vendasCartao.semCorrespondenciaSistema.filter(l => !ignorados.has(l.id)).length === 0 && (
                  <p>✅ Tudo conciliado.</p>
                )}
              </div>
              </>
              )}
            </div>
          )}

          {resultado.vendasDeArquivoSeparado && resultado.vendasComPagamento && resultado.vendasComPagamento.length > 0 && (
            <div className="card">
              {renderTituloSecao('Vendas × Pagamentos da Maquininha (Código de Autorização)', 'vendasPagamentos')}
              {!secoesRecolhidas.has('vendasPagamentos') && (
              <>
              <p className="upload-dica">
                Liga cada venda ao pagamento correspondente pelo Código de Autorização — uma chave exata, não por valor e data — pra confirmar que aquela venda específica realmente foi liquidada pela maquininha, e não só que a soma do dia bateu com o extrato.
              </p>
              <div className="resumo-grid">
                <div className="resumo-item">
                  <p>Confirmadas</p>
                  <p className="valor-resumo">{resultado.vendasComPagamento.filter((v) => v.encontradoEmPagamentos).length}</p>
                </div>
                <div className="resumo-item">
                  <p>Sem correspondência</p>
                  <p className="valor-resumo">{resultado.vendasComPagamento.filter((v) => !v.encontradoEmPagamentos && !ignorados.has(v.id)).length}</p>
                </div>
              </div>
              <div style={{ marginTop: 15 }}>
                {resultado.vendasComPagamento.filter((v) => !v.encontradoEmPagamentos && !ignorados.has(v.id)).length === 0 ? (
                  <p>✅ Todas as vendas bateram com o relatório de Pagamentos.</p>
                ) : (
                  resultado.vendasComPagamento.filter((v) => !v.encontradoEmPagamentos && !ignorados.has(v.id)).map((v) => (
                    <div key={v.id} className="divergencia-item divergencia-entrada">
                      <div className="info-conta">
                        <p className="desc">{v.descricao}</p>
                        <p className="venc">
                          {formatarDataBR(v.data)}
                          {!v.codigoAutorizacao && ' — esse relatório de Vendas não trouxe Código de Autorização, não dá pra ligar automaticamente'}
                        </p>
                      </div>
                      <p className="valor-conta">{formatarMoeda(v.valor)}</p>
                      <div className="acoes">
                        <button onClick={() => iniciarCasamentoDeVenda(v.id)} className="btn-editar">
                          {casamentoManual?.lado === 'venda' && casamentoManual.id === v.id ? 'Cancelar Casamento' : 'Casar com Pagamentos'}
                        </button>
                        <button onClick={() => marcarIgnorado(v.id)} className="btn-editar">Ignorar</button>
                      </div>
                      {casamentoManual?.lado === 'venda' && casamentoManual.id === v.id &&
                        (() => {
                          const codigosUsados = new Set(
                            resultado.vendasComPagamento
                              .filter((x) => x.encontradoEmPagamentos && x.codigoAutorizacao)
                              .map((x) => x.codigoAutorizacao)
                          );
                          const candidatos = (fontes.maquininha.pagamentosDetalhado || [])
                            .filter((p) => !ignorados.has(p.id) && !codigosUsados.has(p.codigoAutorizacao))
                            .map((p) => ({ ...p, descricao: `Pagamento ${p.bandeira || ''} — Cód. ${p.codigoAutorizacao}`.trim() }));
                          return renderPainelCasamentoManual(v.valor, v.descricao, candidatos);
                        })()}
                    </div>
                  ))
                )}
              </div>
              </>
              )}
            </div>
          )}

          {resultado.taxaMaquininha > 0 && (
            <div className="card">
              {renderTituloSecao('Taxas da Maquininha', 'taxaMaquininha')}
              {!secoesRecolhidas.has('taxaMaquininha') && (
              <>
              {resultado.taxaMaquininhaPorDia && resultado.taxaMaquininhaPorDia.length > 0 ? (
                <>
                <p className="nota-formato">
                  A diferença entre o valor bruto das vendas e o que efetivamente caiu no banco foi de <strong>{formatarMoeda(resultado.taxaMaquininha)}</strong> nesse período.
                  Como a maquininha já desconta a taxa antes de depositar (o que cai na Conta Corrente já é o valor líquido), isso não é uma conta em aberto — lance direto como um débito na Conta Corrente, um por dia, na data real em que a taxa foi descontada, pra bater com o saldo do banco dia a dia.
                </p>
                <div className="acoes" style={{ marginBottom: 10 }}>
                  <button onClick={criarTodasContasTaxaDiarias} className="btn-transferir">
                    Lançar Todas as Taxas Diárias na Conta Corrente
                  </button>
                </div>
                {resultado.taxaMaquininhaPorDia.map((dia) => (
                  <div key={dia.data} className="item-conta">
                    <span>
                      {formatarDataBR(dia.data)} — {formatarMoeda(dia.valor)}
                      {dia.possivelDuplicata && !diasTaxaLancados.has(dia.data) && (
                        <span className="badge-categoria" style={{ color: '#c0392b' }}> ⚠️ Parece já lançada antes</span>
                      )}
                    </span>
                    {diasTaxaLancados.has(dia.data) ? (
                      <span className="nota-formato">✓ Lançada</span>
                    ) : (
                      <button onClick={() => criarContaTaxaDiaria(dia)} className="btn-transferir">
                        Lançar na Conta Corrente
                      </button>
                    )}
                  </div>
                ))}
                </>
              ) : (
                <>
                <p className="nota-formato">
                  A diferença entre o valor bruto das vendas e o que efetivamente caiu no banco foi de <strong>{formatarMoeda(resultado.taxaMaquininha)}</strong> nesse período.
                  Como a maquininha já desconta a taxa antes de depositar (o que cai na Conta Corrente já é o valor líquido), lance esse valor direto como um débito na Conta Corrente, na classificação <strong>"Taxas de Cartão/Maquininha"</strong> — assim o faturamento fica pelo valor bruto (o que o cliente pagou) e a taxa vira despesa separada, não um desconto escondido na receita.
                </p>
                {taxaJaLancada ? (
                  <p className="nota-formato">✓ Lançado como débito na Conta Corrente.</p>
                ) : (
                  <button
                    onClick={() => {
                      onCriarContaTaxaMaquininha(resultado.taxaMaquininha);
                      setTaxaJaLancada(true);
                    }}
                    className="btn-transferir"
                  >
                    Lançar na Conta Corrente
                  </button>
                )}
                </>
              )}
              </>
              )}
            </div>
          )}

          {resultado.composicaoDepositos && resultado.composicaoDepositos.length > 0 && (
            <div className="card">
              {renderTituloSecao('Composição dos Depósitos da Maquininha', 'composicaoDepositos')}
              {!secoesRecolhidas.has('composicaoDepositos') && (
              <>
              <p className="upload-dica">
                Cada linha aqui é um valor agrupado do jeito que cai no extrato (ex: "Maquininha - Crédito Mastercard", que vira "SICREDI CREDITO MASTER" no banco). Clique em "Ver composição" pra conferir quais vendas — com bruto, taxa e líquido de cada uma — somam exatamente esse depósito, e se cada uma já tem comanda no Sistema.
              </p>
              {resultado.composicaoDepositos.map((d) => {
                const aberto = depositosExpandidos.has(d.id);
                const semComanda = d.itens.filter((item) => !item.comandaEncontrada && !ignorados.has(item.id));
                return (
                  <div key={d.id} style={{ marginBottom: 10 }}>
                    <div className="divergencia-item divergencia-entrada">
                      <div className="info-conta">
                        <p className="desc">
                          {formatarDataBR(d.data)} — {d.descricao}{' '}
                          {d.confirmadoNoExtrato ? (
                            <span className="badge-categoria" style={{ color: '#27ae60' }}>
                              ✓ bate com o extrato{d.extratoDescricao ? `: ${d.extratoDescricao}` : ''}
                            </span>
                          ) : (
                            <span className="badge-categoria" style={{ color: '#c0862e' }}>⏳ ainda não achei essa linha no extrato</span>
                          )}
                          {semComanda.length > 0 && (
                            <span className="badge-categoria" style={{ color: '#c0392b' }}>
                              {' '}⚠️ {semComanda.length} venda{semComanda.length > 1 ? 's' : ''} sem comanda no Sistema
                            </span>
                          )}
                        </p>
                        <p className="venc">
                          Bruto {formatarMoeda(d.valorBrutoTotal)} − Taxa {formatarMoeda(d.taxaTotal)} = Líquido {formatarMoeda(d.valorLiquidoTotal)}
                        </p>
                      </div>
                      <p className="valor-conta">{formatarMoeda(d.valorLiquidoTotal)}</p>
                      <div className="acoes">
                        {semComanda.length > 1 && (
                          <button onClick={() => lancarTodasVendasSemComandaDoDeposito(d)} className="btn-transferir">
                            Lançar {semComanda.length} Sem Comanda na Conta Corrente
                          </button>
                        )}
                        <button onClick={() => alternarDeposito(d.id)} className="btn-editar">
                          {aberto ? 'Fechar composição' : `Ver composição (${d.itens.length} venda${d.itens.length > 1 ? 's' : ''})`}
                        </button>
                      </div>
                    </div>
                    {aberto && (
                      <table className="tabela-saldo-conta" style={{ marginTop: 6 }}>
                        <thead>
                          <tr>
                            <th>Data/Hora da Venda</th>
                            <th>Bandeira</th>
                            <th>Valor Bruto</th>
                            <th>Taxa</th>
                            <th>Valor Líquido</th>
                            <th>Comanda no Sistema</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.itens.map((item) => (
                            <tr key={item.id}>
                              <td>
                                {formatarDataBR(item.dataVenda)}
                                {item.dataHoraVenda ? ` ${item.dataHoraVenda.slice(11, 16)}` : ''}
                              </td>
                              <td>{item.bandeira}</td>
                              <td className="valor-entrada">R$ {item.valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="valor-saida">R$ {item.taxa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td>R$ {item.valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td>
                                {item.comandaEncontrada ? (
                                  <span style={{ color: '#27ae60' }}>✓ {item.comandaEncontrada}</span>
                                ) : ignorados.has(item.id) ? (
                                  <span style={{ color: '#27ae60' }}>✓ Lançada como Receita</span>
                                ) : (
                                  <>
                                    <span style={{ color: '#c0392b' }}>⚠️ Sem comanda correspondente</span>
                                    {item.possivelDuplicata && (
                                      <span style={{ color: '#c0392b' }}> (parece já lançada antes)</span>
                                    )}
                                    <br />
                                    <button onClick={() => lancarVendaSemComanda(item, d)} className="btn-pagar" style={{ marginTop: 4 }}>
                                      Lançar na Conta Corrente
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
              </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
