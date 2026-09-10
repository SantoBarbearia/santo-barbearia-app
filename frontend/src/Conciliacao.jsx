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
  parseSicrediVendas,
  parseBalancoSistema,
  calcularTaxasPagamentos,
  calcularTaxasVendas,
  lerTextoArquivo,
  paraDataISO
} from './conciliacao/parsers';
import { conciliar } from './conciliacao/matching';
import CategoriaSelect from './CategoriaSelect';

const FONTE_VAZIA = { linhas: [], arquivo: null, carregando: false, erro: null, nota: null, taxaMaquininha: null };

const NOTAS_FORMATO = {
  'sicredi-pagamentos': 'Relatório de Pagamentos da Sicredi reconhecido: os valores foram agrupados por dia/bandeira/tipo, do jeito que chegam no extrato.',
  'sicredi-vendas': 'Relatório de Vendas da Sicredi reconhecido: uma linha por venda (valor bruto, antes do desconto da maquininha), pra conferir com o Sistema.',
  'balanco-sistema': 'Balanço do sistema reconhecido: recebimentos via Pix (conferidos com o extrato) e via cartão (conferidos com o relatório de Vendas) já pagos.'
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

export default function Conciliacao({ contasAPagar, movimentacoes, categorias, onLancarMovimentacao, onLancarCaixa, onCriarContaTaxaMaquininha, onDividirLancamento, onLancarFaturamentoBruto }) {
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
  const [secoesRecolhidas, setSecoesRecolhidas] = useState(new Set());

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

  const atualizarFonte = (chave, patch) => {
    setFontes((f) => ({ ...f, [chave]: { ...f[chave], ...patch } }));
  };

  const finalizarComLinhas = (chave, linhas, nomeArquivo, nota, taxaMaquininha) => {
    if (linhas.length === 0) {
      atualizarFonte(chave, {
        carregando: false,
        erro: `O arquivo "${nomeArquivo}" foi lido, mas não encontramos nenhum lançamento nele. Confira se é o arquivo certo e se o período selecionado não veio vazio.`
      });
    } else {
      atualizarFonte(chave, { linhas, arquivo: nomeArquivo, carregando: false, nota: nota || null, taxaMaquininha: taxaMaquininha ?? null });
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
          finalizarComLinhas(chave, linhas, arquivo.name, NOTAS_FORMATO[formato], taxaMaquininha);
        } else if (formato === 'sicredi-vendas') {
          const linhas = parseSicrediVendas(bruto);
          const taxaMaquininha = calcularTaxasVendas(bruto);
          finalizarComLinhas(chave, linhas, arquivo.name, NOTAS_FORMATO[formato], taxaMaquininha);
        } else if (formato === 'balanco-sistema') {
          const linhas = parseBalancoSistema(bruto);
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
    const vendas = fontes.vendas.linhas;

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

    // Dinheiro não passa pelo banco nem pela maquininha — não tem com o que
    // conciliar, só precisa ser lançado no Caixa manualmente.
    const recebimentosDinheiro = sistemaDinheiro.filter((l) => dentroDoPeriodoDoExtrato(l.data));

    // Toda comanda do Sistema paga via Pix ou cartão (esteja ou não conciliada
    // com o extrato) — pra lançar o faturamento pelo valor BRUTO (o que o
    // cliente pagou), com a taxa da maquininha entrando como despesa separada.
    const faturamentoBrutoSistema = fontes.sistema.linhas
      .filter((l) => !l.viaDinheiro)
      .filter((l) => dentroDoPeriodoDoExtrato(l.data));

    const passo1 = conciliar(entradasExtrato, sistemaPix);
    const passo2 = conciliar(passo1.semParA, maquininha);
    const passo2b = conciliar(passo2.semParA, lancamentosManuaisEntrada);
    const passo3 = conciliar(saidasExtrato, pagamentosApp);
    const passo3b = conciliar(passo3.semParA, lancamentosManuaisSaida);
    const passo4 = conciliar(vendas, sistemaCartao);

    // Prefere a taxa calculada a partir de Pagamentos (inclui antecipação); Vendas
    // só tem o desconto de MDR, então serve de estimativa quando só ele foi carregado.
    const taxaMaquininha = fontes.maquininha.taxaMaquininha ?? fontes.vendas.taxaMaquininha ?? null;

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
    const faturamentoBrutoComStatus = faturamentoBrutoSistema.map((l) => ({
      ...l,
      confirmadoNoBanco: l.viaPix ? pixConfirmadoIds.has(l.id) : (l.viaCartao ? cartaoConfirmadoIds.has(l.id) : true)
    }));

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
      recebimentosDinheiro,
      faturamentoBrutoSistema: faturamentoBrutoComStatus,
      paresPixExtratoSistema
    });
    setIgnorados(new Set());
    setTaxaJaLancada(false);
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
    const categoriaPadrao = sugerirCategoriaPorHistorico(linha.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO;
    onLancarCaixa({ ...linha, categoria: categoriaPorLinha[linha.id] ?? categoriaPadrao });
    marcarIgnorado(linha.id);
  };

  const lancarFaturamentoBruto = (linha) => {
    const categoria = categoriaPorLinha[linha.id] ?? sugerirCategoriaPorHistorico(linha.descricao) ?? CATEGORIA_PADRAO_RECEBIMENTO;
    onLancarFaturamentoBruto([{ ...linha, categoria }]);
    marcarIgnorado(linha.id);
  };

  const lancarTodoFaturamentoBruto = (apenasConfirmadas = false) => {
    const todasVisiveis = (resultado.faturamentoBrutoSistema || []).filter((l) => !ignorados.has(l.id));
    const visiveis = apenasConfirmadas ? todasVisiveis.filter((l) => l.confirmadoNoBanco) : todasVisiveis;
    if (visiveis.length === 0) return;
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
  };

  const iniciarCasamentoDeExtrato = (extratoId) => {
    setCasamentoManual((c) => (c?.lado === 'extrato' && c.id === extratoId ? null : { lado: 'extrato', id: extratoId, selecionados: new Set() }));
  };

  const cancelarCasamentoManual = () => setCasamentoManual(null);

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
    } else {
      // O lançamento do extrato some da lista de pendências (não precisa
      // lançar ele direto); as comandas selecionadas ficam confirmadas.
      setResultado((r) => ({
        ...r,
        faturamentoBrutoSistema: r.faturamentoBrutoSistema.map((x) =>
          casamentoManual.selecionados.has(x.id) ? { ...x, confirmadoNoBanco: true } : x
        )
      }));
      setIgnorados((s) => new Set(s).add(casamentoManual.id));
    }
    setCasamentoManual(null);
  };

  const renderPainelCasamentoManual = (valorAlvo, descricaoAlvo, candidatos) => {
    const selecionados = candidatos.filter((c) => casamentoManual.selecionados.has(c.id));
    const soma = Math.round(selecionados.reduce((s, c) => s + (c.valorBruto ?? c.valor), 0) * 100) / 100;
    const bate = Math.abs(soma - valorAlvo) < 0.01;
    return (
      <div className="mapeamento" style={{ width: '100%' }}>
        <p className="nota-formato">
          Selecione o(s) lançamento(s) que juntos formam "{descricaoAlvo}" ({formatarMoeda(valorAlvo)}).
        </p>
        {candidatos.length === 0 ? (
          <p className="nota-formato">Não sobrou nenhum lançamento sem correspondência pra escolher.</p>
        ) : (
          candidatos.map((c) => {
            const outraComanda = c.usadoPorSistemaId
              ? (resultado.faturamentoBrutoSistema || []).find((x) => x.id === c.usadoPorSistemaId)
              : null;
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
              renderPainelCasamentoManual(l.valor, l.descricao, (resultado.faturamentoBrutoSistema || []).filter((c) => !c.confirmadoNoBanco && !ignorados.has(c.id)))}
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
          <strong>✓ Confirmado</strong> = essa comanda já bateu com o extrato (Pix) ou com o Relatório de Vendas da maquininha (Cartão). <strong>⏳ Pendente</strong> = o Cash Barber diz que foi pago, mas ainda não achamos correspondência no banco/maquininha nesse período — pode ser só atraso de compensação, vale conferir antes de lançar.
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
              renderPainelCasamentoManual(l.valorBruto, l.descricao, (() => {
                const paresPix = resultado.paresPixExtratoSistema || [];
                return (fontes.extrato.linhas || [])
                  .filter((e) => e.tipo === 'entrada' && !ignorados.has(e.id))
                  .map((e) => ({ ...e, usadoPorSistemaId: paresPix.find((p) => p.extratoId === e.id)?.sistemaId || null }));
              })())}
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
              <p className="desc">{l.descricao} <span className="origem-tag">(Sistema)</span></p>
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

          {resultado.taxaMaquininha > 0 && (
            <div className="card">
              {renderTituloSecao('Taxas da Maquininha', 'taxaMaquininha')}
              {!secoesRecolhidas.has('taxaMaquininha') && (
              <>
              <p className="nota-formato">
                A diferença entre o valor bruto das vendas e o que efetivamente caiu no banco foi de <strong>{formatarMoeda(resultado.taxaMaquininha)}</strong> nesse período.
                Pra bater com o saldo do banco, lance esse valor como uma despesa em <strong>Contas a Pagar</strong>, na classificação <strong>"Taxas de Cartão/Maquininha"</strong> — assim o faturamento fica pelo valor bruto (o que o cliente pagou) e a taxa vira despesa separada, não um desconto escondido na receita.
              </p>
              {taxaJaLancada ? (
                <p className="nota-formato">✓ Conta a pagar criada — vai aparecer em "Contas em Aberto", pronta pra você pagar de qualquer conta.</p>
              ) : (
                <button
                  onClick={() => {
                    onCriarContaTaxaMaquininha(resultado.taxaMaquininha);
                    setTaxaJaLancada(true);
                  }}
                  className="btn-transferir"
                >
                  Criar Conta a Pagar com esse valor
                </button>
              )}
              </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
