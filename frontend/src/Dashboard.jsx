import React, { useState, useEffect } from 'react';
import { separarCategoria } from './CategoriaSelect';

const CORES = {
  azul: '#2a78d6',
  laranja: '#eb6834',
  textoPrimario: '#0b0b0b',
  textoMudo: '#898781',
  grade: '#e1e0d9',
  eixo: '#c3c2b7'
};

const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatarMoeda(valor) {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarMoedaCompacta(valor) {
  if (Math.abs(valor) >= 1000) return `R$ ${(valor / 1000).toFixed(1)}k`;
  return `R$ ${Math.round(valor)}`;
}

// A tabela movimentacoes guarda a data em dois formatos dependendo de onde
// foi criada (ISO yyyy-mm-dd ou BR dd/mm/yyyy) — normaliza pra ISO antes de
// comparar com o mês selecionado.
function dataMovParaISO(data) {
  if (!data) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes}-${dia}`;
  }
  return data;
}

function tipoVisualMovimentacao(mov) {
  if (mov.tipo === 'Transferência') return 'transferencia';
  if (mov.tipo === 'Despesa Paga' || mov.tipo === 'Débito Manual') return 'saida';
  return 'entrada';
}

function formatarMesLabel(mesISO) {
  const [ano, mesNum] = mesISO.split('-');
  return `${NOMES_MESES[parseInt(mesNum, 10) - 1]}/${ano}`;
}

// Não depende mais de "fechar" mês nenhum — cada mês com movimentação de
// Receitas > Produtos e Serviços entra aqui direto, puxando o dado como ele
// está agora (inclusive o mês corrente, ainda em andamento). O Faturamento
// de Produtos de cada mês vem do mesmo campo do Resumo. Usado tanto pelo
// gráfico de evolução quanto pela projeção — os dois precisam do mesmo
// "faturamento real por mês", já com os 3 níveis de fallback (movimentação
// > lançamento manual > fechamento antigo).
function montarHistoricoFaturamento(fechamentos, faturamentoManual, movimentacoes) {
  const produtosPorMes = {};
  faturamentoManual.forEach((f) => { produtosPorMes[f.mes] = f.faturamentoProdutos || 0; });

  const totalPorMes = {};
  movimentacoes
    .filter((m) => tipoVisualMovimentacao(m) === 'entrada')
    .forEach((m) => {
      const { nivel1, nivel2 } = separarCategoria(m.categoria);
      if (nivel1 !== 'Receitas' || nivel2 !== 'Produtos e Serviços') return;
      const mes = dataMovParaISO(m.data).slice(0, 7);
      totalPorMes[mes] = (totalPorMes[mes] || 0) + m.valor;
    });

  const mesesDasMovimentacoes = Object.keys(totalPorMes);
  const fechamentosPorMovimentacao = mesesDasMovimentacoes.map((mes) => ({
    mes,
    mesLabel: formatarMesLabel(mes),
    faturamentoProdutos: produtosPorMes[mes] || 0,
    faturamentoServicos: totalPorMes[mes] - (produtosPorMes[mes] || 0)
  }));

  // Meses antigos lançados manualmente no Resumo (sem movimentação nenhuma
  // no sistema) completam o histórico de antes de usar o app.
  const mesesComMovimentacao = new Set(mesesDasMovimentacoes);
  const fechamentosDoHistoricoManual = faturamentoManual
    .filter(f => f.faturamentoTotalManual != null && !mesesComMovimentacao.has(f.mes))
    .map(f => ({
      mes: f.mes,
      mesLabel: formatarMesLabel(f.mes),
      faturamentoProdutos: f.faturamentoProdutos || 0,
      faturamentoServicos: f.faturamentoTotalManual - (f.faturamentoProdutos || 0)
    }));

  // Fechamentos antigos (de quando existia o botão "Fechar Mês") só entram
  // pra um mês que não tenha nem movimentação nem lançamento manual — pra
  // não perder histórico de antes dessa mudança.
  const mesesJaCobertos = new Set([...mesesDasMovimentacoes, ...fechamentosDoHistoricoManual.map(f => f.mes)]);
  const fechamentosAntigos = fechamentos.filter(f => !mesesJaCobertos.has(f.mes));

  return [...fechamentosPorMovimentacao, ...fechamentosDoHistoricoManual, ...fechamentosAntigos]
    .map(f => ({ ...f, faturamentoTotal: (f.faturamentoServicos || 0) + (f.faturamentoProdutos || 0) }));
}

function GraficoLinhaFaturamento({ fechamentos, faturamentoManual, movimentacoes }) {
  const [hover, setHover] = useState(null);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [modoVisualizacao, setModoVisualizacao] = useState('separado');

  const todosOsFechamentos = montarHistoricoFaturamento(fechamentos, faturamentoManual, movimentacoes);

  if (todosOsFechamentos.length === 0) {
    return <p>Assim que tiver uma Receita de Produtos e Serviços lançada (pela Conciliação ou manualmente) ou o Faturamento Total de um mês antigo, a evolução aparece aqui.</p>;
  }

  const filtroPeriodo = (
    <div className="form-transferencia" style={{ marginBottom: 15 }}>
      <div className="input-group">
        <label>De</label>
        <input type="month" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
      </div>
      <div className="input-group">
        <label>Até</label>
        <input type="month" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
      </div>
      {(periodoInicio || periodoFim) && (
        <button onClick={() => { setPeriodoInicio(''); setPeriodoFim(''); }} className="btn-cancelar">Limpar filtro</button>
      )}
      <button onClick={() => setModoVisualizacao('separado')} className={modoVisualizacao === 'separado' ? 'btn-transferir' : 'btn-editar'}>Separado (Produtos/Serviços)</button>
      <button onClick={() => setModoVisualizacao('total')} className={modoVisualizacao === 'total' ? 'btn-transferir' : 'btn-editar'}>Só o Total</button>
    </div>
  );

  const dentroDoPeriodo = (mes) => (!periodoInicio || mes >= periodoInicio) && (!periodoFim || mes <= periodoFim);
  const ordenados = [...todosOsFechamentos].filter(f => dentroDoPeriodo(f.mes)).sort((a, b) => a.mes.localeCompare(b.mes));

  if (ordenados.length === 0) {
    return (
      <div>
        {filtroPeriodo}
        <p>Nenhum faturamento nesse período.</p>
      </div>
    );
  }

  const largura = 720, altura = 260, margemEsq = 55, margemDir = 65, margemTopo = 20, margemBaixo = 35;
  const areaW = largura - margemEsq - margemDir;
  const areaH = altura - margemTopo - margemBaixo;

  const series = modoVisualizacao === 'total'
    ? [{ campo: 'faturamentoTotal', cor: CORES.azul, label: 'Total' }]
    : [{ campo: 'faturamentoServicos', cor: CORES.azul, label: 'Serviços' }, { campo: 'faturamentoProdutos', cor: CORES.laranja, label: 'Produtos' }];

  const maxValor = Math.max(1, ...ordenados.flatMap(f => series.map(s => f[s.campo])));
  const tetoEscala = Math.ceil(maxValor / 500) * 500 || 500;

  const x = (i) => margemEsq + (ordenados.length === 1 ? areaW / 2 : (i / (ordenados.length - 1)) * areaW);
  const y = (v) => margemTopo + areaH - (v / tetoEscala) * areaH;
  const linha = (campo) => ordenados.map((f, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(f[campo])}`).join(' ');

  const ticksY = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(tetoEscala * p));
  const ultimo = ordenados[ordenados.length - 1];

  return (
    <div>
      {filtroPeriodo}
      <div className="legenda-grafico">
        {series.map(s => (
          <span key={s.campo}><i style={{ background: s.cor }}></i> {s.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" style={{ maxWidth: largura }}>
        {ticksY.map((t, i) => (
          <g key={i}>
            <line x1={margemEsq} x2={largura - margemDir} y1={y(t)} y2={y(t)} stroke={CORES.grade} strokeWidth="1" />
            <text x={margemEsq - 8} y={y(t) + 4} fontSize="11" fill={CORES.textoMudo} textAnchor="end">{formatarMoedaCompacta(t)}</text>
          </g>
        ))}
        <line x1={margemEsq} x2={largura - margemDir} y1={margemTopo + areaH} y2={margemTopo + areaH} stroke={CORES.eixo} strokeWidth="1" />

        {series.map(s => (
          <path key={s.campo} d={linha(s.campo)} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {ordenados.map((f, i) => (
          <g key={i}>
            {series.map(s => (
              <circle
                key={s.campo}
                cx={x(i)} cy={y(f[s.campo])} r="4" fill={s.cor} stroke="#fff" strokeWidth="2"
                onMouseEnter={() => setHover({ i, campo: s.campo })} onMouseLeave={() => setHover(null)}
              />
            ))}
            <text x={x(i)} y={altura - 8} fontSize="11" fill={CORES.textoMudo} textAnchor="middle">{f.mesLabel}</text>
          </g>
        ))}

        {series.map(s => (
          <text key={s.campo} x={x(ordenados.length - 1) + 10} y={y(ultimo[s.campo]) + 4} fontSize="11" fill={CORES.textoPrimario} fontWeight="600">
            {formatarMoedaCompacta(ultimo[s.campo])}
          </text>
        ))}
      </svg>
      {hover && (
        <div className="tooltip-grafico">
          {ordenados[hover.i].mesLabel} — {series.find(s => s.campo === hover.campo)?.label}: {formatarMoeda(ordenados[hover.i][hover.campo])}
        </div>
      )}
    </div>
  );
}

function GraficoBarrasDespesas({ contasAPagar }) {
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  const dentroDoPeriodo = (dataBR) => {
    if (!periodoInicio && !periodoFim) return true;
    const [dia, mes, ano] = dataBR.split('/');
    const iso = `${ano}-${mes}-${dia}`;
    if (periodoInicio && iso < periodoInicio) return false;
    if (periodoFim && iso > periodoFim) return false;
    return true;
  };

  // Filtra pela data em que a despesa foi de fato PAGA (quando saiu do banco
  // de verdade), não pelo vencimento — o vencimento quase sempre cai num mês
  // diferente do pagamento, então filtrar por ele fazia o gráfico não trazer
  // nada quando ela filtrava pelo período em que realmente pagou as contas.
  const filtradas = contasAPagar.filter(c => c.status === 'Pago' && dentroDoPeriodo(c.dataPagamento || c.vencimento));
  const porCategoria = {};
  filtradas.forEach(c => {
    const cat = c.categoria || 'Sem classificação';
    porCategoria[cat] = (porCategoria[cat] || 0) + c.valor;
  });
  const dados = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const maxValor = Math.max(1, ...dados.map(d => d[1]));

  return (
    <div>
      <div className="form-transferencia" style={{ marginBottom: 15 }}>
        <div className="input-group">
          <label>De</label>
          <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Até</label>
          <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
        </div>
        {(periodoInicio || periodoFim) && (
          <button onClick={() => { setPeriodoInicio(''); setPeriodoFim(''); }} className="btn-cancelar">Limpar filtro</button>
        )}
      </div>
      {dados.length === 0 ? (
        <p>Nenhuma despesa paga {(periodoInicio || periodoFim) ? 'nesse período' : 'registrada ainda'}.</p>
      ) : (
        <div className="barras-horizontais">
          {dados.map(([categoria, valor]) => (
            <div key={categoria} className="linha-barra" title={`${categoria}: ${formatarMoeda(valor)}`}>
              <span className="rotulo-barra">{categoria}</span>
              <div className="trilho-barra">
                <div className="preenchimento-barra" style={{ width: `${(valor / maxValor) * 100}%`, background: CORES.azul }}></div>
              </div>
              <span className="valor-barra">{formatarMoeda(valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumoContabilidade({ comissoes, barbeiros, movimentacoes, faturamentoManual, onSalvarFaturamentoProdutos, onSalvarFaturamentoTotalManual, onFecharMes }) {
  const [copiado, setCopiado] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [filtroAnoHistorico, setFiltroAnoHistorico] = useState('todos');

  const hoje = new Date();
  const mesAtualISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [mesFechamento, setMesFechamento] = useState(mesAtualISO);

  const registroManualDoMes = faturamentoManual.find(f => f.mes === mesFechamento);
  const faturamentoProdutosSalvo = registroManualDoMes?.faturamentoProdutos ?? 0;
  const faturamentoTotalManualSalvo = registroManualDoMes?.faturamentoTotalManual ?? null;
  const [produtoInput, setProdutoInput] = useState(String(faturamentoProdutosSalvo || ''));
  const [totalManualInput, setTotalManualInput] = useState(faturamentoTotalManualSalvo != null ? String(faturamentoTotalManualSalvo) : '');
  useEffect(() => {
    setProdutoInput(String(faturamentoProdutosSalvo || ''));
    setTotalManualInput(faturamentoTotalManualSalvo != null ? String(faturamentoTotalManualSalvo) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesFechamento]);

  const mesLabel = formatarMesLabel(mesFechamento);

  // Faturamento Total/Outras Entradas vêm das movimentações de verdade
  // (lançadas manualmente ou via Conciliação), não de números digitados à
  // parte — é o valor que realmente foi lançado como Receita no sistema.
  const movimentacoesDoMes = movimentacoes.filter((m) => (
    tipoVisualMovimentacao(m) === 'entrada' && dataMovParaISO(m.data).slice(0, 7) === mesFechamento
  ));
  const somarPorCategoria = (filtro) => movimentacoesDoMes
    .filter((m) => filtro(separarCategoria(m.categoria)))
    .reduce((soma, m) => soma + m.valor, 0);
  // "Produtos e Serviços" é a classificação real que o app usa por padrão pra
  // toda comanda lançada via Conciliação (CATEGORIA_PADRAO_RECEBIMENTO) — o
  // Cash Barber não separa produto de serviço na comanda, por isso o
  // faturamento sai junto aqui e ela divide manualmente abaixo.
  const faturamentoTotalCalculado = somarPorCategoria(({ nivel1, nivel2 }) => nivel1 === 'Receitas' && nivel2 === 'Produtos e Serviços');
  const outrasEntradas = somarPorCategoria(({ nivel1, nivel2 }) => nivel1 === 'Receitas' && nivel2 !== 'Produtos e Serviços');
  // Meses antigos (de antes de usar o sistema) não têm movimentação nenhuma
  // lançada — pra esses, o valor digitado aqui manualmente vale como o
  // Faturamento Total do mês, só pra manter um histórico.
  const totalManualDigitado = parseFloat(totalManualInput) || 0;
  const faturamentoTotal = totalManualDigitado > 0 ? totalManualDigitado : faturamentoTotalCalculado;
  const faturamentoProdutos = parseFloat(produtoInput) || 0;
  const faturamentoServicos = faturamentoTotal - faturamentoProdutos;

  const salvarProduto = () => onSalvarFaturamentoProdutos(mesFechamento, parseFloat(produtoInput) || 0);
  const salvarTotalManual = () => onSalvarFaturamentoTotalManual(mesFechamento, parseFloat(totalManualInput) || 0);

  const historicoFaturamento = faturamentoManual
    .filter(f => f.faturamentoTotalManual != null)
    .sort((a, b) => b.mes.localeCompare(a.mes));
  const anosHistorico = [...new Set(historicoFaturamento.map(f => f.mes.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const historicoFiltrado = filtroAnoHistorico === 'todos'
    ? historicoFaturamento
    : historicoFaturamento.filter(f => f.mes.slice(0, 4) === filtroAnoHistorico);

  const somar = (campo) => barbeiros.reduce((soma, b) => soma + (comissoes[b.chave][campo] || 0), 0);
  const comissaoBruta = somar('servicos') + somar('produtos') + somar('assinatura');
  const comissaoLiquida = comissaoBruta - somar('vale') - somar('consumo') - somar('mei');

  const linhasBarbeiros = barbeiros.map(b => {
    const c = comissoes[b.chave];
    const bruta = c.servicos + c.produtos + c.assinatura;
    const liquida = bruta - c.vale - c.consumo - c.mei;
    return `- ${b.nome}: Bruta ${formatarMoeda(bruta)} | Líquida ${formatarMoeda(liquida)}`;
  }).join('\n');

  const texto = `RESUMO FINANCEIRO — Santo Barbearia
Período: ${mesLabel}

Faturamento Total (Produtos + Serviços): ${formatarMoeda(faturamentoTotal)}
  Faturamento de Produtos: ${formatarMoeda(faturamentoProdutos)}
  Faturamento de Serviços: ${formatarMoeda(faturamentoServicos)}
Outras Entradas: ${formatarMoeda(outrasEntradas)}

Comissão Bruta dos Barbeiros (ciclo atual, sem descontos de vale, consumo ou MEI): ${formatarMoeda(comissaoBruta)}
Comissão Líquida dos Barbeiros (ciclo atual, com descontos): ${formatarMoeda(comissaoLiquida)}

Detalhamento por barbeiro:
${linhasBarbeiros}`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Não consegui copiar automaticamente. Copie o texto abaixo (Ctrl+C):', texto);
    }
  };

  return (
    <div className="card">
      <h3>Resumo para Contabilidade</h3>
      <div className="form-transferencia" style={{ marginBottom: 15 }}>
        <div className="input-group">
          <label>Mês a ser fechado</label>
          <input type="month" value={mesFechamento} onChange={(e) => setMesFechamento(e.target.value)} />
        </div>
      </div>

      <p className="venc" style={{ marginBottom: 10 }}>Período: {mesLabel}</p>
      <div className="resumo-grid" style={{ marginBottom: 15 }}>
        <div className="resumo-item">
          <p>Faturamento Total</p>
          <p className="valor-resumo">{formatarMoeda(faturamentoTotal)}</p>
        </div>
        <div className="resumo-item">
          <p>Outras Entradas</p>
          <p className="valor-resumo">{formatarMoeda(outrasEntradas)}</p>
        </div>
      </div>

      <div className="form-transferencia" style={{ marginBottom: 15 }}>
        <div className="input-group">
          <label>Faturamento de Produtos ({mesLabel})</label>
          <input type="number" value={produtoInput} onChange={(e) => setProdutoInput(e.target.value)} placeholder="0,00" />
        </div>
        <button onClick={salvarProduto} className="btn-editar">Salvar</button>
        <div className="input-group">
          <label>Faturamento de Serviços (calculado)</label>
          <input type="text" value={formatarMoeda(faturamentoServicos)} disabled />
        </div>
      </div>

      <div className="form-transferencia" style={{ marginBottom: 15 }}>
        <div className="input-group">
          <label>Faturamento Total — meses antigos ({mesLabel})</label>
          <input type="number" value={totalManualInput} onChange={(e) => setTotalManualInput(e.target.value)} placeholder="0,00" />
        </div>
        <button onClick={salvarTotalManual} className="btn-editar">Salvar</button>
      </div>
      <p className="upload-dica" style={{ marginTop: -10, marginBottom: 15 }}>
        Pra meses de antes de usar o sistema, sem movimentação lançada — digite aqui só o Faturamento Total do mês pra manter o histórico. Enquanto tiver algo digitado aqui, ele substitui o Faturamento Total calculado acima.
      </p>

      {historicoFaturamento.length > 0 && (
        <div style={{ marginBottom: 15 }}>
          <button
            onClick={() => setHistoricoAberto(!historicoAberto)}
            className="btn-editar"
            style={{ marginBottom: historicoAberto ? 8 : 0 }}
          >
            {historicoAberto ? '▲ Ocultar' : '▼ Mostrar'} Histórico de Faturamento Total ({historicoFaturamento.length} {historicoFaturamento.length === 1 ? 'mês' : 'meses'})
          </button>

          {historicoAberto && (
            <>
              {anosHistorico.length > 1 && (
                <div className="input-group" style={{ maxWidth: 160, marginBottom: 8 }}>
                  <label>Filtrar por ano</label>
                  <select value={filtroAnoHistorico} onChange={(e) => setFiltroAnoHistorico(e.target.value)}>
                    <option value="todos">Todos</option>
                    {anosHistorico.map(ano => <option key={ano} value={ano}>{ano}</option>)}
                  </select>
                </div>
              )}
              <table className="tabela-saldo-conta">
                <thead>
                  <tr><th>Mês</th><th>Faturamento Total</th><th>Faturamento de Produtos</th><th>Faturamento de Serviços</th><th>% Produtos sobre Serviços</th></tr>
                </thead>
                <tbody>
                  {historicoFiltrado.map(f => {
                    const produtos = f.faturamentoProdutos || 0;
                    const servicos = f.faturamentoTotalManual - produtos;
                    const percentual = servicos > 0 ? `${((produtos / servicos) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
                    return (
                      <tr key={f.mes}>
                        <td>{formatarMesLabel(f.mes)}</td>
                        <td>{formatarMoeda(f.faturamentoTotalManual)}</td>
                        <td>{formatarMoeda(produtos)}</td>
                        <td>{formatarMoeda(servicos)}</td>
                        <td>{percentual}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <pre className="resumo-texto">{texto}</pre>
      <div className="acoes" style={{ marginTop: 10 }}>
        <button onClick={copiar} className="btn-transferir">{copiado ? '✓ Copiado!' : 'Copiar Resumo'}</button>
        <button onClick={onFecharMes} className="btn-editar">Fechar Ciclo de Comissões</button>
      </div>
    </div>
  );
}

// Lista "YYYY-MM" de cada mês entre início e fim (inclusive), nessa ordem
// mesmo se vierem trocados.
function enumerarMeses(inicio, fim) {
  let [anoI, mesI] = inicio.split('-').map(Number);
  let [anoF, mesF] = fim.split('-').map(Number);
  if (anoI > anoF || (anoI === anoF && mesI > mesF)) {
    [anoI, anoF] = [anoF, anoI];
    [mesI, mesF] = [mesF, mesI];
  }
  const meses = [];
  let ano = anoI, mes = mesI;
  while (ano < anoF || (ano === anoF && mes <= mesF)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

// Farol: compara o faturamento real do mês com a meta projetada pra ele.
// 100% ou mais bate a meta (verde), entre 80% e 100% chegou perto (amarelo),
// abaixo de 80% ficou longe (vermelho).
function calcularFarol(real, meta) {
  if (!meta || meta <= 0) return null;
  const percentual = real / meta;
  if (percentual >= 1) return 'verde';
  if (percentual >= 0.8) return 'amarelo';
  return 'vermelho';
}

// % de Crescimento não é mais digitado à mão: é calculado a partir do
// histórico, no mesmo espírito da planilha da Fernanda (Média de um ano
// contra a média do ano anterior), só que suavizado — em vez de olhar só
// os 2 últimos anos fechados, calcula o crescimento ano a ano de TODOS os
// pares de anos consecutivos disponíveis no histórico e tira a média
// deles, pra um ano atípico (parado, muito forte etc.) não distorcer
// sozinho a meta inteira. No fim desconta o % de Aumento de Preço, que já
// está embutido nesse crescimento histórico, sobrando só o orgânico. O ano
// corrente (ainda em andamento) nunca entra na conta.
function calcularCrescimentoHistorico(historico, percentualAumento) {
  const anoAtual = new Date().getFullYear();
  const media = (valores) => valores.reduce((s, v) => s + v, 0) / valores.length;

  const valoresPorAno = {};
  historico.forEach(f => {
    const ano = parseInt(f.mes.slice(0, 4), 10);
    if (ano >= anoAtual) return;
    (valoresPorAno[ano] = valoresPorAno[ano] || []).push(f.faturamentoTotal);
  });

  const anos = Object.keys(valoresPorAno).map(Number).sort((a, b) => a - b);
  const crescimentosAnuais = [];
  for (let i = 1; i < anos.length; i++) {
    if (anos[i] - anos[i - 1] !== 1) continue; // só compara anos consecutivos
    const mediaAnterior = media(valoresPorAno[anos[i - 1]]);
    if (mediaAnterior <= 0) continue;
    crescimentosAnuais.push((media(valoresPorAno[anos[i]]) / mediaAnterior - 1) * 100);
  }

  if (crescimentosAnuais.length === 0) return { percentual: null, anosUsados: 0 };
  const crescimentoTotalHistoricoMedio = media(crescimentosAnuais);
  return {
    percentual: crescimentoTotalHistoricoMedio - (parseFloat(percentualAumento) || 0),
    anosUsados: crescimentosAnuais.length + 1
  };
}

const CORES_FAROL = { verde: '#27ae60', amarelo: '#f0ad4e', vermelho: '#c0392b' };

function Farol({ cor, titulo }) {
  if (!cor) return <span style={{ color: '#ccc' }}>—</span>;
  return <span title={titulo} style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: CORES_FAROL[cor] }}></span>;
}

function ProjecaoFaturamento({ fechamentos, faturamentoManual, movimentacoes, projecaoParametros, onSalvarProjecaoParametros }) {
  const [dataAumento, setDataAumento] = useState(projecaoParametros.dataAumento || '');
  const [percentualAumento, setPercentualAumento] = useState(String(projecaoParametros.percentualAumento || ''));

  useEffect(() => {
    setDataAumento(projecaoParametros.dataAumento || '');
    setPercentualAumento(String(projecaoParametros.percentualAumento || ''));
  }, [projecaoParametros.dataAumento, projecaoParametros.percentualAumento]);

  const anoAtual = new Date().getFullYear();
  const [periodoInicio, setPeriodoInicio] = useState(`${anoAtual}-01`);
  const [periodoFim, setPeriodoFim] = useState(`${anoAtual}-12`);

  const historico = montarHistoricoFaturamento(fechamentos, faturamentoManual, movimentacoes);
  const porMes = {};
  historico.forEach(f => { porMes[f.mes] = f; });

  // % de Crescimento não é mais digitado: sai do histórico real (YoY),
  // descontando o próprio % de Aumento de Preço que já empurrou esse
  // crescimento pra cima — sobra só o crescimento orgânico.
  const { percentual: percentualCrescimento, anosUsados } = calcularCrescimentoHistorico(historico, percentualAumento);

  const salvar = () => onSalvarProjecaoParametros({
    dataAumento,
    percentualAumento: parseFloat(percentualAumento) || 0,
    percentualCrescimento: percentualCrescimento || 0
  });

  // Mesma conta da planilha: pega o mesmo mês do ano anterior e aplica os
  // dois percentuais somados (aumento de preço + crescimento), igual em
  // todo mês do período — o aumento de preço normalmente acontece uma vez,
  // no fim do ano anterior, então já vale pro ano inteiro sendo projetado;
  // por isso a data serve só de referência de quando foi, sem entrar na
  // conta mês a mês.
  const fatorAjuste = 1 + ((parseFloat(percentualAumento) || 0) + (percentualCrescimento || 0)) / 100;

  const linhas = enumerarMeses(periodoInicio, periodoFim).map((mesISO) => {
    const [ano, mes] = mesISO.split('-').map(Number);
    const mesAnteriorISO = `${ano - 1}-${String(mes).padStart(2, '0')}`;
    const base = porMes[mesAnteriorISO];
    const meta = base ? base.faturamentoTotal * fatorAjuste : null;

    const real = porMes[mesISO];
    if (real && real.faturamentoTotal > 0) {
      return { mes: mesISO, valor: real.faturamentoTotal, meta, origem: 'real', farol: calcularFarol(real.faturamentoTotal, meta) };
    }
    if (meta == null) return { mes: mesISO, valor: null, meta: null, origem: 'sem-dado', farol: null };
    return { mes: mesISO, valor: meta, meta, origem: 'projetado', farol: null };
  });

  const totalPeriodo = linhas.reduce((s, l) => s + (l.valor || 0), 0);
  const rotuloOrigem = { real: 'Real', projetado: 'Projetado', 'sem-dado': 'Sem dado' };
  const rotuloFarol = { verde: 'Bateu a meta', amarelo: 'Perto da meta (80% a 99%)', vermelho: 'Longe da meta (abaixo de 80%)' };

  return (
    <div className="card">
      <h3>Projeção de Faturamento</h3>
      <p className="nota-formato">
        Estima o faturamento dos meses do período abaixo que ainda não têm movimentação lançada: pega o mesmo mês do ano anterior e aplica o % de Aumento de Preço + % de Crescimento (somados) por cima. Nos meses que já têm faturamento real, o farol mostra se bateu a meta projetada pra esse mês. O % de Crescimento é calculado sozinho como a média do crescimento ano a ano de todo o histórico fechado (não só do último ano, pra um ano atípico não distorcer a meta sozinho), descontando o próprio % de Aumento de Preço que já está embutido nesse crescimento.
      </p>
      <div className="form-transferencia" style={{ marginBottom: 15 }}>
        <div className="input-group">
          <label>Período — De</label>
          <input type="month" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Período — Até</label>
          <input type="month" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
        </div>
      </div>
      <div className="form-transferencia" style={{ marginBottom: 15 }}>
        <div className="input-group">
          <label>Data do último aumento de preço (referência)</label>
          <input type="date" value={dataAumento} onChange={(e) => setDataAumento(e.target.value)} />
        </div>
        <div className="input-group">
          <label>% de Aumento de Preço</label>
          <input type="number" value={percentualAumento} onChange={(e) => setPercentualAumento(e.target.value)} placeholder="0,0" />
        </div>
        <div className="input-group">
          <label>% de Crescimento (média de {anosUsados > 0 ? `${anosUsados} anos` : '—'} do histórico)</label>
          <input
            type="text"
            value={percentualCrescimento != null ? `${percentualCrescimento.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : 'Sem histórico suficiente'}
            disabled
          />
        </div>
        <button onClick={salvar} className="btn-editar">Salvar</button>
      </div>

      <table className="tabela-saldo-conta">
        <thead>
          <tr><th>Mês</th><th>Faturamento</th><th>Meta Projetada</th><th>Farol</th><th>Origem</th></tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.mes}>
              <td>{formatarMesLabel(l.mes)}</td>
              <td>{l.valor != null ? formatarMoeda(l.valor) : '—'}</td>
              <td>{l.meta != null ? formatarMoeda(l.meta) : '—'}</td>
              <td><Farol cor={l.farol} titulo={l.farol ? rotuloFarol[l.farol] : ''} /></td>
              <td>{rotuloOrigem[l.origem]}</td>
            </tr>
          ))}
          <tr>
            <td><strong>Total do Período</strong></td>
            <td><strong>{formatarMoeda(totalPeriodo)}</strong></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Observacoes({ notas, onAdicionarNota, onExcluirNota }) {
  const [texto, setTexto] = useState('');
  const ordenadas = [...notas].sort((a, b) => b.id - a.id);

  const adicionar = () => {
    onAdicionarNota(texto);
    setTexto('');
  };

  return (
    <div className="card">
      <h3>Observações</h3>
      <div className="form-transferencia">
        <div className="input-group" style={{ gridColumn: '1 / -1' }}>
          <label>Nova observação</label>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex: Aumento do aluguel a partir de setembro"
            onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }}
          />
        </div>
        <button onClick={adicionar} disabled={!texto.trim()} className="btn-transferir">Adicionar</button>
      </div>
      {ordenadas.length === 0 ? (
        <p>Nenhuma observação registrada.</p>
      ) : (
        <div className="lista-notas">
          {ordenadas.map(n => (
            <div key={n.id} className="item-nota">
              <div>
                <p className="nota-data">{n.data}</p>
                <p className="nota-texto">{n.texto}</p>
              </div>
              <button onClick={() => onExcluirNota(n.id)} className="btn-excluir">Excluir</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ comissoes, barbeiros, contasAPagar, fechamentos, notas, movimentacoes, faturamentoManual, onSalvarFaturamentoProdutos, onSalvarFaturamentoTotalManual, projecaoParametros, onSalvarProjecaoParametros, onFecharMes, onAdicionarNota, onExcluirNota }) {
  return (
    <div>
      <ResumoContabilidade
        comissoes={comissoes}
        barbeiros={barbeiros}
        movimentacoes={movimentacoes}
        faturamentoManual={faturamentoManual}
        onSalvarFaturamentoProdutos={onSalvarFaturamentoProdutos}
        onSalvarFaturamentoTotalManual={onSalvarFaturamentoTotalManual}
        onFecharMes={onFecharMes}
      />

      <div className="card">
        <h3>Faturamento Mensal (evolução)</h3>
        <GraficoLinhaFaturamento fechamentos={fechamentos} faturamentoManual={faturamentoManual} movimentacoes={movimentacoes} />
      </div>

      <ProjecaoFaturamento
        fechamentos={fechamentos}
        faturamentoManual={faturamentoManual}
        movimentacoes={movimentacoes}
        projecaoParametros={projecaoParametros}
        onSalvarProjecaoParametros={onSalvarProjecaoParametros}
      />

      <div className="card">
        <h3>Despesas por Classificação Contábil</h3>
        <GraficoBarrasDespesas contasAPagar={contasAPagar} />
      </div>

      <Observacoes notas={notas} onAdicionarNota={onAdicionarNota} onExcluirNota={onExcluirNota} />
    </div>
  );
}
