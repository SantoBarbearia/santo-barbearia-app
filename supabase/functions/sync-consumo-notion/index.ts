// Puxa os lançamentos de consumo dos barbeiros feitos no Notion (base "🛒
// Consumo dos Barbeiros") que ainda não foram sincronizados, soma o valor
// (preço de custo) por barbeiro, e marca cada lançamento puxado como
// "Sincronizado" no Notion — assim, rodar de novo nunca conta o mesmo
// lançamento duas vezes, mesmo que ela clique em "Atualizar" várias vezes
// antes de fechar o ciclo de comissões.
//
// O front-end soma o resultado (por barbeiro) ao campo "consumo" que já
// existe nas comissões, em vez de substituir — assim não perde nenhum valor
// lançado manualmente antes dessa integração existir.

const NOTION_VERSION = "2022-06-28";
const CONSUMO_DATABASE_ID = "a918102d1a0b4c7bbdb4b1b48e4042bb";

// Página do barbeiro no Notion (relation "Barbeiro") -> chave usada no app.
// Barbeiros fora dessa lista (Maria Paula, vagas "Novo Barbeiro N" etc.) não
// entram no desconto de comissão automático — ficam de fora do resultado,
// listados em "naoMapeados" pra ela decidir o que fazer manualmente.
const BARBEIRO_POR_PAGINA_NOTION: Record<string, string> = {
  "399fdccf-f522-80c8-a654-ea4c496563a5": "eduardo",
  "399fdccf-f522-8071-b2e9-d18860eaf1a5": "gabriel",
  "399fdccf-f522-80e2-91db-e6d684d03437": "thais",
  "399fdccf-f522-80b6-a7ad-ccce1826965e": "thiago",
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

async function buscarLancamentosNaoSincronizados(notionToken: string) {
  const paginas: any[] = [];
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
    paginas.push(...pagina.results);
    cursor = pagina.has_more ? pagina.next_cursor : undefined;
  } while (cursor);
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
    const naoMapeados: { pagina: string; valor: number }[] = [];
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

      // O Notion pode levar alguns segundos pra terminar de calcular o rollup
      // "Valor" depois que o Produto é preenchido -- se isso acontece bem no
      // instante em que a gente sincroniza, a API retorna 0 mesmo com produto
      // vinculado. Em vez de gravar esse zero e marcar como sincronizado
      // (perdendo o valor real pra sempre), deixamos esse lançamento pra
      // tentar de novo na próxima sincronização.
      if (produtoRelacao && valorUnitario === 0) {
        aindaCalculando.push({ pagina: lancamento.url ?? lancamento.id });
        continue;
      }

      if (!barbeiroRelacao) {
        // Lançamento sem barbeiro vinculado -- não dá pra saber de quem
        // descontar, então fica de fora e é reportado pra ela conferir.
        naoMapeados.push({ pagina: lancamento.url ?? lancamento.id, valor });
        continue;
      }

      const chave = BARBEIRO_POR_PAGINA_NOTION[barbeiroRelacao.id];

      if (!chave) {
        naoMapeados.push({ pagina: lancamento.url ?? lancamento.id, valor });
        continue;
      }

      consumoPorBarbeiro[chave] = Math.round(((consumoPorBarbeiro[chave] ?? 0) + valor) * 100) / 100;
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
