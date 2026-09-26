// Puxa os lançamentos de consumo (barbeiros de comissão + funcionários de
// salário fixo) feitos no Notion (base "🛒 Consumo dos Barbeiros") que ainda
// não foram sincronizados, soma o valor (preço de custo x quantidade) por
// pessoa, e marca cada lançamento puxado como "Sincronizado" no Notion —
// assim, rodar de novo nunca conta o mesmo lançamento duas vezes, mesmo que
// ela clique em "Atualizar" várias vezes antes de fechar o ciclo.
//
// O front-end soma o resultado ao campo "consumo" que já existe nas
// comissões (barbeiros) ou na Folha de Pagamento (funcionários fixos), em
// vez de substituir — assim não perde nenhum valor lançado manualmente antes
// dessa integração existir.

const NOTION_VERSION = "2022-06-28";
const CONSUMO_DATABASE_ID = "a918102d1a0b4c7bbdb4b1b48e4042bb";

// Página do barbeiro no Notion (relation "Barbeiro") -> chave usada no app.
// Barbeiros fora dessa lista entram em FUNCIONARIO_FIXO_POR_PAGINA_NOTION
// (Folha de Pagamento) ou, se não estiverem em nenhuma das duas, ficam de
// fora do resultado, listados em "naoMapeados" pra ela decidir manualmente
// (ex: vagas "Novo Barbeiro N" ainda não preenchidas).
const BARBEIRO_POR_PAGINA_NOTION: Record<string, string> = {
  "399fdccf-f522-80c8-a654-ea4c496563a5": "eduardo",
  "399fdccf-f522-8071-b2e9-d18860eaf1a5": "gabriel",
  "399fdccf-f522-80e2-91db-e6d684d03437": "thais",
  "399fdccf-f522-80b6-a7ad-ccce1826965e": "thiago",
};

// Funcionários de salário fixo (não entram na comissão dos barbeiros --
// o consumo deles abate do salário, na aba "Folha de Pagamento").
const FUNCIONARIO_FIXO_POR_PAGINA_NOTION: Record<string, string> = {
  "3e4fdccf-f522-81b6-948e-f1395e6f2976": "mariapaula",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function notionFetch(path: string, init: RequestInit, notionToken: string) {
  const resposta = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Notion API ${resposta.status}: ${corpo}`);
  }
  return resposta.json();
}

async function listarIdsNaoSincronizados(notionToken: string) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const pagina: any = await notionFetch(
      `/databases/${CONSUMO_DATABASE_ID}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: { property: "Sincronizado", checkbox: { equals: false } },
          start_cursor: cursor,
        }),
      },
      notionToken,
    );
    ids.push(...pagina.results.map((pagina: any) => pagina.id));
    cursor = pagina.has_more ? pagina.next_cursor : undefined;
  } while (cursor);
  return ids;
}

// O endpoint de listagem (/databases/{id}/query) usa um índice de busca que
// pode ficar desatualizado nos relacionamentos (Barbeiro, Produto) por bem
// mais tempo do que o esperado -- às vezes minutos depois do lançamento ser
// criado. Buscar cada página individualmente (GET /pages/{id}) é a forma
// confiável de pegar os relacionamentos e o rollup já calculados de verdade.
async function buscarLancamentosNaoSincronizados(notionToken: string) {
  const ids = await listarIdsNaoSincronizados(notionToken);
  const paginas: any[] = [];
  for (const id of ids) {
    paginas.push(await notionFetch(`/pages/${id}`, { method: "GET" }, notionToken));
  }
  return paginas;
}

async function marcarComoSincronizado(pageId: string, notionToken: string) {
  await notionFetch(
    `/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties: { Sincronizado: { checkbox: true } } }),
    },
    notionToken,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const notionToken = Deno.env.get("NOTION_API_KEY");
    if (!notionToken) {
      throw new Error("NOTION_API_KEY não configurado nos secrets do Supabase.");
    }

    const lancamentos = await buscarLancamentosNaoSincronizados(notionToken);

    const consumoPorBarbeiro: Record<string, number> = {};
    const consumoPorFuncionarioFixo: Record<string, number> = {};
    const naoMapeados: { pagina: string; valor: number; motivo: string }[] = [];
    const aindaCalculando: { pagina: string }[] = [];
    const idsSincronizados: string[] = [];

    for (const lancamento of lancamentos) {
      const barbeiroRelacao = lancamento.properties?.Barbeiro?.relation?.[0];
      const produtoRelacao = lancamento.properties?.Produto?.relation?.[0];
      const valorRollup = lancamento.properties?.Valor?.rollup;
      const valorUnitario = valorRollup?.type === "number" ? (valorRollup.number ?? 0) : 0;

      // "Quantidade" é opcional -- se o barbeiro não preencher (ou deixar em
      // branco), assume 1 unidade.
      const quantidadeNumero = lancamento.properties?.Quantidade?.number;
      const quantidade = typeof quantidadeNumero === "number" && quantidadeNumero > 0 ? quantidadeNumero : 1;
      const valor = Math.round(valorUnitario * quantidade * 100) / 100;

      if (!produtoRelacao) {
        // Lançamento sem produto vinculado (linha em branco/incompleta) --
        // não tem o que somar, fica de fora reportado pra ela conferir.
        naoMapeados.push({ pagina: lancamento.url ?? lancamento.id, valor: 0, motivo: "sem Produto vinculado" });
        continue;
      }

      // O Notion pode levar alguns minutos pra terminar de indexar um
      // lançamento recém-criado -- tanto o relacionamento "Produto" quanto o
      // rollup "Valor" podem aparecer incompletos pra quem consulta logo em
      // seguida (não só o rollup). Em vez de gravar um valor errado (0) e
      // marcar como sincronizado -- perdendo o valor real pra sempre -- um
      // lançamento criado há menos de 5 minutos com valor ainda zerado fica
      // pendente pra tentar de novo na próxima sincronização.
      const criadoEmMs = lancamento.created_time ? new Date(lancamento.created_time).getTime() : 0;
      const recemCriado = Date.now() - criadoEmMs < 5 * 60 * 1000;
      if (valor === 0 && recemCriado) {
        aindaCalculando.push({ pagina: lancamento.url ?? lancamento.id });
        continue;
      }

      if (!barbeiroRelacao) {
        // Lançamento sem barbeiro vinculado -- não dá pra saber de quem
        // descontar, então fica de fora e é reportado pra ela conferir.
        naoMapeados.push({ pagina: lancamento.url ?? lancamento.id, valor, motivo: "sem Barbeiro vinculado" });
        continue;
      }

      const chaveBarbeiro = BARBEIRO_POR_PAGINA_NOTION[barbeiroRelacao.id];
      const chaveFuncionarioFixo = FUNCIONARIO_FIXO_POR_PAGINA_NOTION[barbeiroRelacao.id];

      if (chaveBarbeiro) {
        consumoPorBarbeiro[chaveBarbeiro] = Math.round(((consumoPorBarbeiro[chaveBarbeiro] ?? 0) + valor) * 100) / 100;
      } else if (chaveFuncionarioFixo) {
        // Funcionário de salário fixo (ex: Maria Paula) -- o consumo dele
        // abate do salário na Folha de Pagamento, não da comissão.
        consumoPorFuncionarioFixo[chaveFuncionarioFixo] = Math.round(((consumoPorFuncionarioFixo[chaveFuncionarioFixo] ?? 0) + valor) * 100) / 100;
      } else {
        naoMapeados.push({ pagina: lancamento.url ?? lancamento.id, valor, motivo: `Barbeiro não cadastrado no app (id Notion: ${barbeiroRelacao.id})` });
        continue;
      }

      idsSincronizados.push(lancamento.id);
    }

    // Só marca como sincronizado DEPOIS de calcular tudo certo -- se algo
    // falhar antes daqui, nada foi marcado e ela pode rodar de novo sem
    // perder nenhum lançamento.
    for (const pageId of idsSincronizados) {
      await marcarComoSincronizado(pageId, notionToken);
    }

    return new Response(
      JSON.stringify({
        consumoPorBarbeiro,
        consumoPorFuncionarioFixo,
        totalLancamentosSincronizados: idsSincronizados.length,
        naoMapeados,
        aindaCalculando,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (erro) {
    return new Response(JSON.stringify({ error: String(erro?.message ?? erro) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
