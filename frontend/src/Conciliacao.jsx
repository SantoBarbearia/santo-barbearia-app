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

function formatarMoeda(valor) {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function Conciliacao({ contasAPagar, movimentacoes, categorias, onLancarMovimentacao }) {
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
    const maquininha = fontes.maquininha.linhas;
    const vendas = fontes.vendas.linhas;

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
      });

    // Lançamentos manuais já feitos direto no app (aba Visão Geral > Adicionar
    // Crédito/Débito, inclusive os que vieram de uma conciliação anterior) —
    // se já batem com uma linha do extrato, não precisam ser lançados de novo.
    const lancamentosManuaisEntrada = (movimentacoes || [])
      .filter((m) => m.tipo === 'Crédito Manual')
      .map((m) => ({ id: `manual-mov-${m.id}`, data: paraDataISO(m.data), descricao: m.descricao, valor: m.valor, tipo: 'entrada' }))
      .filter((m) => m.data);

    const lancamentosManuaisSaida = (movimentacoes || [])
      .filter((m) => m.tipo === 'Débito Manual')
      .map((m) => ({ id: `manual-mov-${m.id}`, data: paraDataISO(m.data), descricao: m.descricao, valor: m.valor, tipo: 'saida' }))
      .filter((m) => m.data);

    const passo1 = conciliar(entradasExtrato, sistemaPix);
    const passo2 = conciliar(passo1.semParA, maquininha);
    const passo2b = conciliar(passo2.semParA, lancamentosManuaisEntrada);
    const passo3 = conciliar(saidasExtrato, pagamentosApp);
    const passo3b = conciliar(passo3.semParA, lancamentosManuaisSaida);
    const passo4 = conciliar(vendas, sistemaCartao);

    // Prefere a taxa calculada a partir de Pagamentos (inclui antecipação); Vendas
    // só tem o desconto de MDR, então serve de estimativa quando só ele foi carregado.
    const taxaMaquininha = fontes.maquininha.taxaMaquininha ?? fontes.vendas.taxaMaquininha ?? null;

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
      taxaMaquininha
    });
    setIgnorados(new Set());
  };

  const marcarIgnorado = (id) => {
    setIgnorados((s) => new Set(s).add(id));
  };

  const lancarMovimentacao = (linha) => {
    onLancarMovimentacao({ ...linha, categoria: categoriaPorLinha[linha.id] || '' });
    marcarIgnorado(linha.id);
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

  const renderDivergencias = (titulo, lista, origemLabel) => {
    const visiveis = lista.filter((l) => !ignorados.has(l.id));
    if (visiveis.length === 0) return null;
    return (
      <div>
        <p className="venc" style={{ marginBottom: 8 }}>{titulo}</p>
        {visiveis.map((l) => (
          <div key={l.id} className="item-conta divergencia-item">
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
                    value={categoriaPorLinha[l.id] || ''}
                    onChange={(valor) => setCategoriaPorLinha((c) => ({ ...c, [l.id]: valor }))}
                  />
                  <button onClick={() => lancarMovimentacao(l)} className="btn-pagar">Lançar na Conta Corrente</button>
                </>
              )}
              <button onClick={() => marcarIgnorado(l.id)} className="btn-editar">Ignorar</button>
            </div>
          </div>
        ))}
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
            <h3>Recebimentos</h3>
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
              {renderDivergencias('Entradas no extrato sem correspondência:', resultado.recebimentos.semCorrespondenciaExtrato, 'Extrato')}
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
          </div>

          <div className="card">
            <h3>Pagamentos</h3>
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
          </div>

          {fontes.vendas.linhas.length > 0 && (
            <div className="card">
              <h3>Vendas no Cartão vs. Sistema</h3>
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
            </div>
          )}

          {resultado.taxaMaquininha > 0 && (
            <div className="card">
              <h3>Taxas da Maquininha</h3>
              <p className="nota-formato">
                A diferença entre o valor bruto das vendas e o que efetivamente caiu no banco foi de <strong>{formatarMoeda(resultado.taxaMaquininha)}</strong> nesse período.
                Pra bater com o saldo do banco, considere lançar esse valor como uma despesa em <strong>Contas a Pagar</strong>, na classificação <strong>"Taxas de Cartão/Maquininha"</strong> — assim o faturamento fica pelo valor bruto (o que o cliente pagou) e a taxa vira despesa separada, não um desconto escondido na receita.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
