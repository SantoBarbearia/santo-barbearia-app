import React, { useState } from 'react';

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

function GraficoLinhaFaturamento({ fechamentos }) {
  const [hover, setHover] = useState(null);

  if (fechamentos.length === 0) {
    return <p>Feche o primeiro mês (botão "Fechar Mês" no Resumo acima) pra começar a ver a evolução aqui.</p>;
  }

  const ordenados = [...fechamentos].sort((a, b) => a.mes.localeCompare(b.mes));
  const largura = 720, altura = 260, margemEsq = 55, margemDir = 65, margemTopo = 20, margemBaixo = 35;
  const areaW = largura - margemEsq - margemDir;
  const areaH = altura - margemTopo - margemBaixo;

  const maxValor = Math.max(1, ...ordenados.flatMap(f => [f.faturamentoServicos, f.faturamentoProdutos]));
  const tetoEscala = Math.ceil(maxValor / 500) * 500 || 500;

  const x = (i) => margemEsq + (ordenados.length === 1 ? areaW / 2 : (i / (ordenados.length - 1)) * areaW);
  const y = (v) => margemTopo + areaH - (v / tetoEscala) * areaH;
  const linha = (campo) => ordenados.map((f, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(f[campo])}`).join(' ');

  const ticksY = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(tetoEscala * p));
  const ultimo = ordenados[ordenados.length - 1];

  return (
    <div>
      <div className="legenda-grafico">
        <span><i style={{ background: CORES.azul }}></i> Serviços</span>
        <span><i style={{ background: CORES.laranja }}></i> Produtos</span>
      </div>
      <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" style={{ maxWidth: largura }}>
        {ticksY.map((t, i) => (
          <g key={i}>
            <line x1={margemEsq} x2={largura - margemDir} y1={y(t)} y2={y(t)} stroke={CORES.grade} strokeWidth="1" />
            <text x={margemEsq - 8} y={y(t) + 4} fontSize="11" fill={CORES.textoMudo} textAnchor="end">{formatarMoedaCompacta(t)}</text>
          </g>
        ))}
        <line x1={margemEsq} x2={largura - margemDir} y1={margemTopo + areaH} y2={margemTopo + areaH} stroke={CORES.eixo} strokeWidth="1" />

        <path d={linha('faturamentoServicos')} fill="none" stroke={CORES.azul} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={linha('faturamentoProdutos')} fill="none" stroke={CORES.laranja} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {ordenados.map((f, i) => (
          <g key={i}>
            <circle
              cx={x(i)} cy={y(f.faturamentoServicos)} r="4" fill={CORES.azul} stroke="#fff" strokeWidth="2"
              onMouseEnter={() => setHover({ i, campo: 'faturamentoServicos' })} onMouseLeave={() => setHover(null)}
            />
            <circle
              cx={x(i)} cy={y(f.faturamentoProdutos)} r="4" fill={CORES.laranja} stroke="#fff" strokeWidth="2"
              onMouseEnter={() => setHover({ i, campo: 'faturamentoProdutos' })} onMouseLeave={() => setHover(null)}
            />
            <text x={x(i)} y={altura - 8} fontSize="11" fill={CORES.textoMudo} textAnchor="middle">{f.mesLabel}</text>
          </g>
        ))}

        <text x={x(ordenados.length - 1) + 10} y={y(ultimo.faturamentoServicos) + 4} fontSize="11" fill={CORES.textoPrimario} fontWeight="600">
          {formatarMoedaCompacta(ultimo.faturamentoServicos)}
        </text>
        <text x={x(ordenados.length - 1) + 10} y={y(ultimo.faturamentoProdutos) + 4} fontSize="11" fill={CORES.textoPrimario} fontWeight="600">
          {formatarMoedaCompacta(ultimo.faturamentoProdutos)}
        </text>
      </svg>
      {hover && (
        <div className="tooltip-grafico">
          {ordenados[hover.i].mesLabel} — {hover.campo === 'faturamentoServicos' ? 'Serviços' : 'Produtos'}: {formatarMoeda(ordenados[hover.i][hover.campo])}
        </div>
      )}
    </div>
  );
}

function GraficoBarrasDespesas({ contasAPagar }) {
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  const dentroDoPeriodo = (vencimentoBR) => {
    if (!periodoInicio && !periodoFim) return true;
    const [dia, mes, ano] = vencimentoBR.split('/');
    const iso = `${ano}-${mes}-${dia}`;
    if (periodoInicio && iso < periodoInicio) return false;
    if (periodoFim && iso > periodoFim) return false;
    return true;
  };

  const filtradas = contasAPagar.filter(c => c.status === 'Pago' && dentroDoPeriodo(c.vencimento));
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

// Divergente: comissão líquida pode ficar negativa (ex: MEI descontado sem faturamento
// no ciclo), então a barra precisa crescer pra baixo nesse caso — nunca pra cima como
// se fosse um valor positivo pequeno.
function GraficoComissaoPorBarbeiro({ comissoes, barbeiros }) {
  const dados = barbeiros.map(b => {
    const c = comissoes[b.chave];
    const liquida = (c.servicos + c.produtos + c.assinatura) - (c.vale + c.consumo + c.mei);
    return { nome: b.nome.split(' ')[0], liquida };
  });
  const maxAbs = Math.max(1, ...dados.map(d => Math.abs(d.liquida)));
  const REGIAO_PX = 90;

  return (
    <div className="colunas-divergentes">
      {dados.map(d => {
        const positivo = d.liquida >= 0;
        const alturaBarra = Math.max(2, (Math.abs(d.liquida) / maxAbs) * REGIAO_PX);
        return (
          <div key={d.nome} className="coluna-divergente-item" title={`${d.nome}: ${formatarMoeda(d.liquida)}`}>
            <span className="valor-coluna-topo">{positivo ? formatarMoedaCompacta(d.liquida) : ''}</span>
            <div className="regiao-positiva" style={{ height: REGIAO_PX }}>
              {positivo && <div className="barra-divergente" style={{ height: alturaBarra, background: CORES.azul }}></div>}
            </div>
            <div className="linha-base"></div>
            <div className="regiao-negativa" style={{ height: REGIAO_PX }}>
              {!positivo && <div className="barra-divergente negativa" style={{ height: alturaBarra, background: '#c0392b' }}></div>}
            </div>
            <span className="valor-coluna-baixo">{!positivo ? formatarMoedaCompacta(d.liquida) : ''}</span>
            <span className="rotulo-coluna">{d.nome}</span>
          </div>
        );
      })}
    </div>
  );
}

function ResumoContabilidade({ comissoes, barbeiros, onFecharMes }) {
  const [copiado, setCopiado] = useState(false);

  const somar = (campo) => barbeiros.reduce((soma, b) => soma + (comissoes[b.chave][campo] || 0), 0);
  const totalServicos = somar('servicos');
  const totalProdutos = somar('produtos');
  const totalAssinatura = somar('assinatura');
  const comissaoBruta = totalServicos + totalProdutos + totalAssinatura;
  const totalVale = somar('vale');
  const totalConsumo = somar('consumo');
  const totalMei = somar('mei');
  const comissaoLiquida = comissaoBruta - totalVale - totalConsumo - totalMei;

  const hoje = new Date();
  const mesAtual = `${NOMES_MESES[hoje.getMonth()]}/${hoje.getFullYear()}`;

  const linhasBarbeiros = barbeiros.map(b => {
    const c = comissoes[b.chave];
    const bruta = c.servicos + c.produtos + c.assinatura;
    const liquida = bruta - c.vale - c.consumo - c.mei;
    return `- ${b.nome}: Bruta ${formatarMoeda(bruta)} | Líquida ${formatarMoeda(liquida)}`;
  }).join('\n');

  const texto = `RESUMO FINANCEIRO — Santo Barbearia
Período: ${mesAtual}

Faturamento de Serviços: ${formatarMoeda(totalServicos)}
Faturamento de Produtos: ${formatarMoeda(totalProdutos)}
Faturamento de Assinaturas: ${formatarMoeda(totalAssinatura)}

Comissão Bruta dos Barbeiros (sem descontos de vale, consumo ou MEI): ${formatarMoeda(comissaoBruta)}
Comissão Líquida dos Barbeiros (com descontos): ${formatarMoeda(comissaoLiquida)}

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
      <pre className="resumo-texto">{texto}</pre>
      <div className="acoes" style={{ marginTop: 10 }}>
        <button onClick={copiar} className="btn-transferir">{copiado ? '✓ Copiado!' : 'Copiar Resumo'}</button>
        <button onClick={onFecharMes} className="btn-editar">Fechar Mês (salvar no histórico)</button>
      </div>
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

export default function Dashboard({ comissoes, barbeiros, contasAPagar, fechamentos, notas, onFecharMes, onAdicionarNota, onExcluirNota }) {
  return (
    <div>
      <ResumoContabilidade comissoes={comissoes} barbeiros={barbeiros} onFecharMes={onFecharMes} />

      <div className="card">
        <h3>Faturamento Mensal (evolução)</h3>
        <GraficoLinhaFaturamento fechamentos={fechamentos} />
      </div>

      <div className="card">
        <h3>Despesas por Classificação Contábil</h3>
        <GraficoBarrasDespesas contasAPagar={contasAPagar} />
      </div>

      <div className="card">
        <h3>Comissão Líquida por Barbeiro (ciclo atual)</h3>
        <GraficoComissaoPorBarbeiro comissoes={comissoes} barbeiros={barbeiros} />
      </div>

      <Observacoes notas={notas} onAdicionarNota={onAdicionarNota} onExcluirNota={onExcluirNota} />
    </div>
  );
}
