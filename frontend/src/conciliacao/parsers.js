// Exports de bancos e maquininhas brasileiras costumam vir em Windows-1252/Latin1,
// não UTF-8 — arquivo.text() sempre assume UTF-8 e transforma todo acento em "�".
// Lê como UTF-8 primeiro; se aparecer o caractere de substituição (sinal de bytes
// inválidos pra UTF-8), lê de novo como Windows-1252.
export async function lerTextoArquivo(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const textoUtf8 = new TextDecoder('utf-8').decode(buffer);
  if (textoUtf8.includes('�')) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
  return textoUtf8;
}

// Converte "R$ 1.234,56", "-131,65", "1234.56" etc. em número
export function parseValorBR(valor) {
  if (typeof valor === 'number') return valor;
  if (valor === null || valor === undefined) return NaN;
  let s = String(valor).trim().replace(/^R\$\s*/i, '');
  if (s === '') return NaN;

  const negativo = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/^-/, '');

  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPonto > ultimaVirgula) {
    s = s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return negativo ? -n : n;
}

// Converte datas em vários formatos (dd/mm/aaaa, aaaa-mm-dd, ddmmaaaa, serial do Excel) para "aaaa-mm-dd"
export function paraDataISO(valor) {
  if (valor instanceof Date && !isNaN(valor)) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === 'number') {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + valor * 86400000);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(valor ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if (m) {
    let ano = m[3];
    if (ano.length === 2) ano = (parseInt(ano, 10) > 50 ? '19' : '20') + ano;
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return null;
}

let contadorId = 0;
function novoId(prefixo) {
  contadorId += 1;
  return `${prefixo}-${Date.now()}-${contadorId}`;
}

export function parseOFX(texto) {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  return blocos
    .map((bloco) => {
      const dt = (bloco.match(/<DTPOSTED>\s*([^\s<]+)/i) || [])[1] || '';
      const valorStr = (bloco.match(/<TRNAMT>\s*([^\s<]+)/i) || [])[1] || '';
      const memo = (bloco.match(/<MEMO>\s*([^\r\n<]+)/i) || [])[1] || '';
      const name = (bloco.match(/<NAME>\s*([^\r\n<]+)/i) || [])[1] || '';
      const valor = parseValorBR(valorStr);
      // DTPOSTED do OFX vem no formato AAAAMMDD[hhmmss] — diferente do dd/mm/aaaa usado no resto do app
      const digitos = dt.slice(0, 8);
      const data = /^\d{8}$/.test(digitos)
        ? `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`
        : null;
      return {
        id: novoId('ofx'),
        data,
        descricao: (memo || name || 'Lançamento OFX').trim(),
        valor: Math.abs(valor),
        tipo: valor < 0 ? 'saida' : 'entrada'
      };
    })
    .filter((t) => t.data && !isNaN(t.valor) && t.valor > 0);
}

// Parser experimental: procura por padrões de data e valor+C/D em arquivos CNAB240.
// As posições exatas variam por banco — se não bater com o extrato real, prefira OFX.
export function parseCNAB240(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 30);
  const registros = [];

  linhas.forEach((linha) => {
    const candidatosData = [...linha.matchAll(/(\d{2})(\d{2})(\d{4})/g)];
    let dataEncontrada = null;
    for (const m of candidatosData) {
      const dia = parseInt(m[1], 10);
      const mes = parseInt(m[2], 10);
      const ano = parseInt(m[3], 10);
      if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2099) {
        dataEncontrada = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        break;
      }
    }

    const valorMatch = linha.match(/(\d{2,15})([CD])(?![A-Z0-9])/);
    if (dataEncontrada && valorMatch) {
      const valor = parseInt(valorMatch[1], 10) / 100;
      const tipo = valorMatch[2] === 'D' ? 'saida' : 'entrada';
      if (valor > 0) {
        const textoLivre = (linha.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s]{6,}/g) || [])
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        registros.push({
          id: novoId('cnab'),
          data: dataEncontrada,
          descricao: textoLivre.slice(0, 60) || 'Lançamento CNAB240',
          valor,
          tipo
        });
      }
    }
  });

  return registros;
}

export async function parseCSVBruto(texto) {
  const { default: Papa } = await import('papaparse');
  const resultado = Papa.parse(texto.trim(), { skipEmptyLines: true });
  return resultado.data;
}

export async function parseXLSXBruto(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

function encontrarLinhaCabecalho(linhas, primeiraColunaEsperada) {
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i]?.[0] || '').trim() === primeiraColunaEsperada) return i;
  }
  return -1;
}

// Reconhece formatos conhecidos (Sicredi maquininha, balanço do sistema) pra pular o
// mapeamento manual de colunas e já aplicar o tratamento certo pra cada um.
export function detectarFormatoConhecido(linhas) {
  if (!linhas || linhas.length === 0) return null;

  const primeiraCelula = String(linhas[0]?.[0] || '').replace(/^﻿/, '').trim();
  const segundaCelula = String(linhas[0]?.[1] || '').trim();
  if (primeiraCelula === 'Tipo' && segundaCelula === 'Descrição') return 'balanco-sistema';

  // Exportação em XLSX vem com linhas de título ("Relatório de Pagamentos.", período,
  // etc.) antes do cabeçalho; a exportação em CSV às vezes começa direto no cabeçalho.
  for (let i = 0; i < Math.min(linhas.length, 6); i++) {
    const c0 = String(linhas[i]?.[0] || '');
    if (c0.includes('Relatório de Pagamentos')) return 'sicredi-pagamentos';
    if (c0.includes('Relatório de Vendas')) return 'sicredi-vendas';
  }
  if (primeiraCelula === 'Data de pagamento' && segundaCelula === 'Código de pagamento') return 'sicredi-pagamentos';
  if (primeiraCelula === 'Data da venda' && segundaCelula === 'Hora da venda') return 'sicredi-vendas';

  return null;
}

// Relatório de Pagamentos da maquininha Sicredi: cada linha é uma venda/parcela
// individual, mas o banco deposita o valor agrupado por dia + bandeira + tipo de
// liquidação (Débito/Crédito/Antecipação). Agrupamos do mesmo jeito pra bater 1:1
// com as linhas do extrato.
export function parseSicrediPagamentos(linhas) {
  const idxCabecalho = encontrarLinhaCabecalho(linhas, 'Data de pagamento');
  if (idxCabecalho === -1) return [];
  const dados = linhas.slice(idxCabecalho + 1).filter((r) => r[0]);

  const grupos = {};
  dados.forEach((r) => {
    const dataPagamento = r[0];
    const tipoPagamento = r[2];
    const tipoTransacao = r[14];
    const bandeira = r[15];
    const valorLiquido = parseValorBR(r[22]) || 0;
    const categoria = tipoPagamento === 'Antecipação Automática' ? 'Antecipação' : (tipoTransacao === 'Débito' ? 'Débito' : 'Crédito');
    const chave = `${dataPagamento}|${categoria}|${bandeira}`;

    if (!grupos[chave]) {
      grupos[chave] = {
        data: paraDataISO(dataPagamento),
        descricao: `Maquininha - ${categoria} ${bandeira}`,
        valor: 0,
        tipo: 'entrada'
      };
    }
    grupos[chave].valor += valorLiquido;
  });

  return Object.values(grupos)
    .map((g) => ({ ...g, id: novoId('maq'), valor: Math.round(g.valor * 100) / 100 }))
    .filter((g) => g.data && g.valor > 0);
}

// Exportação do sistema (balanço): mistura recebimentos, pagamentos e linhas de
// resumo num único CSV. Só os recebimentos "A RECEBER" já pagos entram — via Pix
// (que aparecem individualmente no extrato) ou via cartão (que batem com o
// relatório de Vendas da maquininha, não com o extrato direto). "Em aberto" ainda
// não virou dinheiro, então fica de fora.
export function parseBalancoSistema(linhas) {
  const idxCabecalho = encontrarLinhaCabecalho(linhas, 'Tipo');
  const inicio = idxCabecalho === -1 ? 0 : idxCabecalho + 1;
  const registros = [];

  for (let i = inicio; i < linhas.length; i++) {
    const r = linhas[i];
    if (String(r[0] || '').trim() !== 'A RECEBER') continue;
    if (String(r[7] || '').trim() !== 'Pago') continue;

    const formaPagamento = String(r[3] || '').trim();
    const viaPix = /^pix/i.test(formaPagamento);
    const viaCartao = /crédito|débito|cartão/i.test(formaPagamento);
    if (!viaPix && !viaCartao) continue;

    const valor = parseValorBR(r[6]);
    if (!(valor > 0)) continue;
    const data = paraDataISO(r[5]) || paraDataISO(r[4]);
    if (!data) continue;

    registros.push({
      id: novoId('sis'),
      data,
      descricao: String(r[1] || 'Recebimento'),
      valor,
      tipo: 'entrada',
      viaPix,
      viaCartao
    });
  }

  return registros;
}

// Relatório de Vendas da maquininha Sicredi: cada parcela de uma venda parcelada
// vira uma linha própria, mas "Valor bruto da transação" já repete o valor total
// da venda em todas elas — então agrupamos por "Comprovante de venda" pra
// reconstruir uma linha por venda (o que bate com uma comanda do sistema).
export function parseSicrediVendas(linhas) {
  const idxCabecalho = encontrarLinhaCabecalho(linhas, 'Data da venda');
  if (idxCabecalho === -1) return [];
  const dados = linhas.slice(idxCabecalho + 1).filter((r) => r[0]);

  const vistos = new Map();
  dados.forEach((r) => {
    const comprovante = r[5];
    if (!comprovante || vistos.has(comprovante)) return;

    const data = paraDataISO(r[0]);
    const valorBruto = parseValorBR(r[14]);
    const bandeira = r[12];
    if (!data || !(valorBruto > 0)) return;

    vistos.set(comprovante, {
      id: novoId('venda'),
      data,
      descricao: `Venda no cartão - ${bandeira}`,
      valor: Math.round(valorBruto * 100) / 100,
      tipo: 'entrada'
    });
  });

  return Array.from(vistos.values());
}

// Soma bruto - líquido do relatório de Vendas (só o desconto de MDR — se o
// relatório de Pagamentos também estiver carregado, use calcularTaxasPagamentos,
// que já inclui antecipação e é mais precisa).
export function calcularTaxasVendas(linhas) {
  const idxCabecalho = encontrarLinhaCabecalho(linhas, 'Data da venda');
  if (idxCabecalho === -1) return 0;
  const dados = linhas.slice(idxCabecalho + 1).filter((r) => r[0]);
  const total = dados.reduce((soma, r) => soma + (parseValorBR(r[17]) || 0), 0);
  return Math.round(total * 100) / 100;
}

// Soma bruto - líquido do relatório de Pagamentos (inclui MDR e antecipação —
// é o valor mais preciso do total de taxas cobradas pela maquininha).
export function calcularTaxasPagamentos(linhas) {
  const idxCabecalho = encontrarLinhaCabecalho(linhas, 'Data de pagamento');
  if (idxCabecalho === -1) return 0;
  const dados = linhas.slice(idxCabecalho + 1).filter((r) => r[0]);
  const total = dados.reduce((soma, r) => {
    const bruto = parseValorBR(r[18]) || 0;
    const liquido = parseValorBR(r[22]) || 0;
    return soma + (bruto - liquido);
  }, 0);
  return Math.round(total * 100) / 100;
}

export function normalizarComMapeamento(linhasBrutas, mapeamento) {
  const dados = mapeamento.temCabecalho ? linhasBrutas.slice(1) : linhasBrutas;
  return dados
    .map((linha) => {
      const data = paraDataISO(linha[mapeamento.colData]);
      const valor = parseValorBR(linha[mapeamento.colValor]);
      const descricao = String(linha[mapeamento.colDescricao] ?? '').trim();
      return {
        id: novoId('manual'),
        data,
        descricao: descricao || 'Sem descrição',
        valor: Math.abs(valor),
        tipo: valor < 0 ? 'saida' : 'entrada'
      };
    })
    .filter((t) => t.data && !isNaN(t.valor) && t.valor > 0);
}

async function extrairLinhasPDF(arrayBuffer) {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const linhas = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const porLinha = {};
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!porLinha[y]) porLinha[y] = [];
      porLinha[y].push(item.str);
    });
    Object.keys(porLinha)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((y) => linhas.push(porLinha[y].join(' ')));
  }

  return linhas;
}

function parseLinhasPDF(linhas) {
  const regexData = /(\d{2}\/\d{2}\/\d{2,4})/;
  const regexValor = /-?R?\$?\s?-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const registros = [];

  linhas.forEach((linha) => {
    const dataMatch = linha.match(regexData);
    const valores = linha.match(regexValor);
    if (dataMatch && valores && valores.length > 0) {
      const valorStr = valores[valores.length - 1];
      const valor = parseValorBR(valorStr);
      if (!isNaN(valor) && valor !== 0) {
        const descricao = linha
          .replace(dataMatch[0], '')
          .replace(valorStr, '')
          .replace(/\s+/g, ' ')
          .trim();
        registros.push({
          id: novoId('pdf'),
          data: paraDataISO(dataMatch[1]),
          descricao: descricao || 'Lançamento PDF',
          valor: Math.abs(valor),
          tipo: valor < 0 ? 'saida' : 'entrada'
        });
      }
    }
  });

  return registros;
}

export async function parsePDF(arrayBuffer) {
  const linhas = await extrairLinhasPDF(arrayBuffer);
  return parseLinhasPDF(linhas);
}
