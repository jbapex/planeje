/**
 * Prompts profissionais para geração de conteúdo do Plano de Campanha.
 * Cada prompt usa todo o contexto preenchido até o momento, garantindo
 * coerência progressiva entre os campos.
 *
 * Filosofia:
 * - Persona específica por campo (não "especialista em marketing" genérico)
 * - Contexto encadeado: cada campo herda o que veio antes
 * - Restrições explícitas para evitar clichês de IA
 * - Formato de saída rigoroso para parsing limpo
 */

export const buildBaseContext = ({ project, client, plan, companyInfo }) => {
  const safe = (v, fallback = '⚠️ ainda não definido') =>
    v && String(v).trim() ? String(v).trim() : fallback;

  const fasesTexto = plan?.conteudo_criativos?.fases?.length
    ? plan.conteudo_criativos.fases
        .map((f, i) => `  ${i + 1}. ${f.nome}: ${f.descricao || '(sem descrição)'}`)
        .join('\n')
    : '⚠️ ainda não definidas';

  const orcamento = plan?.trafego_pago?.orcamento
    ? `R$ ${plan.trafego_pago.orcamento}`
    : '⚠️ não informado';

  const tipoServicoLabel = {
    execucao_completa: 'Execução completa (a JB APEX produz tudo)',
    execucao_parcial: 'Execução parcial (a JB APEX produz parte; o cliente produz parte)',
    apenas_consultoria: 'Apenas consultoria (a JB APEX só orienta; o cliente produz tudo)',
  }[client?.tipo_servico] || 'Execução completa';

  const entregaveis = client?.entregaveis || { carrosseis: 0, posts: 0, stories: 0, videos: 0, anuncios: 0 };
  const entregaveisTexto = client?.tipo_servico === 'apenas_consultoria'
    ? 'CLIENTE DE CONSULTORIA — sem cota fixa. Recomende quantidades estratégicas.'
    : `Pacote mensal contratado:
  - Carrosséis: ${entregaveis.carrosseis}
  - Posts (feed único, não carrossel): ${Number(entregaveis.posts ?? 0)}
  - Stories: ${entregaveis.stories}
  - Vídeos: ${entregaveis.videos}
  - Anúncios: ${entregaveis.anuncios} (vão para a aba Tráfego Pago, não para Materiais)`;

  const dataEvento = project?.data_evento
    ? `Data-âncora desta campanha: ${project.data_evento} (todas as ações devem convergir para essa data)`
    : 'Sem data-âncora específica (campanha distribuída pelo mês)';

  return `# CONTEXTO DO TRABALHO

## Sobre a JB APEX (agência executora)
${safe(companyInfo, 'Agência de marketing digital especializada em performance e conteúdo estratégico.')}

## Sobre o Cliente: ${safe(client?.empresa, 'Cliente')}
- Nicho: ${safe(client?.nicho)}
- Sobre a empresa: ${safe(client?.sobre_empresa)}
- Produtos/serviços: ${safe(client?.produtos_servicos)}
- Público-alvo: ${safe(client?.publico_alvo)}
- Tom de voz padrão da marca: ${safe(client?.tom_de_voz)}

## Tipo de Serviço
${tipoServicoLabel}

## Entregáveis Mensais
${entregaveisTexto}

## Sobre Esta Campanha: ${safe(project?.name, 'Campanha')}
- Mês de referência: ${safe(project?.mes_referencia)}
- Status atual: ${safe(project?.status, 'planejamento')}
- ${dataEvento}

## Plano Atual (preenchido até agora)
- Objetivo: ${safe(plan?.objetivo)}
- Mensagem principal: ${safe(plan?.estrategia_comunicacao?.mensagem_principal)}
- Tom de voz da campanha: ${safe(plan?.estrategia_comunicacao?.tom_voz)}
- Gatilhos emocionais: ${safe(plan?.estrategia_comunicacao?.gatilhos)}
- Fases de conteúdo:
${fasesTexto}
- Orçamento de tráfego: ${orcamento}

## Contexto Adicional Sobre o Cliente (briefing manual)
${safe(plan?.contexto_ia, 'Nenhum contexto adicional fornecido.')}
`;
};

// ─────────────────────────────────────────────────────────────
// PROMPTS POR CAMPO
// ─────────────────────────────────────────────────────────────

const PROMPTS = {
  objetivo: (ctx) => `${ctx}

# SUA TAREFA
Você é diretor de planejamento estratégico em agência de performance, com 15 anos transformando objetivos vagos de cliente em metas mensuráveis que a equipe consegue executar.

Defina O OBJETIVO PRINCIPAL desta campanha.

# COMO PENSAR (não escreva isso na resposta)
1. Qual é o problema real do cliente neste momento? (vendas? autoridade? lançamento? recuperação?)
2. O que o público-alvo precisa fazer pra resolver esse problema? (comprar, agendar, baixar, conhecer?)
3. Em quanto tempo? (um mês de campanha tem limite — seja realista)
4. Como medir se deu certo?

# REGRAS
- Siga o framework SMART (específico, mensurável, atingível, relevante, temporal)
- DEVE conter um número concreto (quantidade, percentual ou valor)
- DEVE conter um prazo (referente ao mês da campanha)
- DEVE estar conectado ao negócio do cliente, não a métricas vazias
- Português do Brasil, linguagem direta de agência
- NÃO use "aumentar engajamento", "fortalecer marca", "construir presença" e outras frases vazias
- NÃO invente dados sobre o cliente — use só o contexto

# FORMATO DA RESPOSTA
Uma única frase de até 240 caracteres. Sem introdução, sem markdown, sem aspas. Apenas o objetivo.`,

  'estrategia_comunicacao.mensagem_principal': (ctx) => `${ctx}

# SUA TAREFA
Você é copywriter sênior treinado nas escolas de Eugene Schwartz (níveis de consciência) e Gary Halbert (mensagem de uma linha). Seu trabalho é encontrar A FRASE que, se o público-alvo lesse no Instagram, faria parar de rolar.

Crie a MENSAGEM PRINCIPAL desta campanha.

# COMO PENSAR (não escreva isso na resposta)
1. Em que nível de consciência o público está? (inconsciente do problema, consciente mas não da solução, comparando soluções, pronto pra comprar)
2. Qual a maior objeção mental dele? (preço, confiança, urgência, identificação)
3. Qual transformação a marca entrega que NINGUÉM mais entrega exatamente assim?
4. Como dizer isso do jeito que o PÚBLICO fala — não do jeito que a marca fala?

# REGRAS
- Máximo 15 palavras
- Linguagem do público, não do marketing
- Deve fazer sentido SOZINHA, sem precisar de explicação
- Deve carregar a transformação ou a promessa, não só descrever o produto
- Coerente com o objetivo já definido acima
- NÃO use clichês: "transforme sua vida", "descubra o segredo", "imagine se", "você merece", "o melhor de", "a solução definitiva"
- NÃO comece com "Conheça", "Descubra", "Apresentamos", "Chegou"

# FORMATO DA RESPOSTA
Apenas a frase. Sem aspas, sem explicação, sem alternativas, sem markdown.`,

  'estrategia_comunicacao.tom_voz': (ctx) => `${ctx}

# SUA TAREFA
Você é diretor de marca que define vozes de marca específicas para campanhas. Não é a voz GERAL da marca (já definida no cadastro do cliente) — é a voz ESPECÍFICA desta campanha, que pode ser uma variação intencional.

Defina o TOM DE VOZ desta campanha.

# COMO PENSAR (não escreva isso na resposta)
1. Esta campanha pede a mesma voz da marca, ou pede uma variação? (lançamento pede mais energia, recuperação pede mais empatia, autoridade pede mais sobriedade)
2. Qual emoção dominante esta campanha precisa provocar?
3. Quais 3 adjetivos descrevem essa voz com precisão?
4. Qual nível de formalidade? (você/tu, gírias sim ou não, emoji sim ou não)

# REGRAS
- No máximo 3 frases
- Use 3 adjetivos ESPECÍFICOS (evite "amigável", "moderno", "criativo" — palavras que não dizem nada)
- Inclua uma instrução de "fala assim" e uma de "não fala assim"
- Coerente com a mensagem principal e o objetivo já definidos

# FORMATO DA RESPOSTA
Texto corrido, sem markdown. Estrutura sugerida:
"Voz [adjetivo 1], [adjetivo 2] e [adjetivo 3]. Fala como [referência concreta]. Usa [instrução positiva]. Evita [instrução negativa]."`,

  'estrategia_comunicacao.gatilhos': (ctx) => `${ctx}

# SUA TAREFA
Você é especialista em neuromarketing e psicologia do consumo (Cialdini, Kahneman, Ariely). Seu trabalho é identificar quais alavancas mentais movem ESTE público específico em direção a ESTE objetivo específico.

Identifique os GATILHOS EMOCIONAIS desta campanha.

# COMO PENSAR (não escreva isso na resposta)
1. O que esse público sente NO MOMENTO antes de tomar a decisão? (medo, desejo, dor, dúvida, frustração)
2. Quais gatilhos clássicos se aplicam? (escassez, urgência, prova social, autoridade, reciprocidade, compromisso, afeição, antecipação, aversão à perda, novidade)
3. Qual a hierarquia? Não use 5 gatilhos — use 3, em ordem de impacto pra ESTE público.
4. Como cada gatilho se manifesta NA PRÁTICA desta campanha? (não basta dizer "escassez" — diga "vagas limitadas até sexta")

# REGRAS
- Exatamente 3 gatilhos, do mais forte pro mais fraco
- Cada gatilho com nome + aplicação prática nesta campanha
- Coerente com tom de voz e mensagem principal já definidos
- NÃO invente gatilhos que não fazem sentido pro público (ex: "exclusividade" pra produto popular)

# FORMATO DA RESPOSTA
Lista separada por vírgulas, cada item no formato "Nome do gatilho (como aplicar)".
Exemplo: "Escassez (vagas limitadas a 30 alunas por turma), Prova social (depoimentos de quem já transformou), Aversão à perda (oferta válida só até domingo)"`,

  'conteudo_criativos.fases': (ctx) => `${ctx}

# SUA TAREFA
Você é estrategista de conteúdo que estrutura jornadas de comunicação por fases. Cada fase tem um objetivo de mudança no estado mental do público.

Crie as FASES DE CONTEÚDO desta campanha.

# COMO PENSAR (não escreva isso na resposta)
1. Onde o público começa? (frio, morno, quente)
2. Qual a sequência mental que ele precisa atravessar pra chegar no objetivo? Pense em AIDA, Jornada do Herói, ou estruturas modernas tipo Atenção → Identificação → Confiança → Decisão.
3. Quanto tempo cada fase ocupa do mês de campanha?
4. Cada fase precisa de UM verbo de mudança claro: "fazer perceber", "fazer desejar", "fazer agir"

# REGRAS
- Crie entre 3 e 4 fases (não mais)
- Cada fase tem nome curto (2-4 palavras) e descrição prática (1-2 frases)
- A descrição diz O QUE produzir nessa fase, não só o conceito
- Coerente com objetivo, mensagem e gatilhos já definidos
- NÃO use nomes genéricos como "Fase 1", "Início", "Conscientização" — use nomes que ESSA campanha pediria

# FORMATO DA RESPOSTA
Apenas JSON válido, sem markdown, sem explicação:
[
  {"id": 1, "nome": "Nome da fase", "descricao": "O que produzir e qual o objetivo desta fase."},
  {"id": 2, "nome": "...", "descricao": "..."},
  {"id": 3, "nome": "...", "descricao": "..."}
]`,

  materiais: (ctx, _, client) => {
    const tipoServico = client?.tipo_servico || 'execucao_completa';
    const entregaveis = client?.entregaveis || { carrosseis: 0, posts: 0, stories: 0, videos: 0, anuncios: 0 };

    if (tipoServico === 'apenas_consultoria') {
      return `${ctx}

# SUA TAREFA
Você é consultor estratégico de conteúdo. O cliente produz internamente — você apenas orienta.

Sugira a ESTRATÉGIA DE CONTEÚDO ideal para esta campanha, recomendando quantidades que o time interno do cliente deveria produzir.

# COMO PENSAR (não escreva isso na resposta)
1. Quantos carrosséis fazem sentido pra essa campanha? Por quê?
2. Quantos posts simples no feed (não carrossel)?
3. Quantos vídeos? Quais formatos?
4. Quantas ideias de stories?
5. Como esses materiais conectam com as fases já definidas?

# REGRAS
- Recomende quantidades realistas para um time interno (não exagere)
- Cada material com job específico, não genérico
- Coerente com objetivo, mensagem e fases já definidos
- Plataforma sugerida: Instagram, TikTok, YouTube ou WhatsApp

# FORMATO DA RESPOSTA
Apenas JSON válido, sem markdown:
{
  "carrosseis": [
    {"id": 1, "descricao": "...", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": "", "plataforma": "Instagram"}
  ],
  "posts": [
    {"id": 1, "descricao": "...", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": "", "plataforma": "Instagram"}
  ],
  "videos": [
    {"id": 1, "descricao": "...", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": "", "plataforma": "Instagram"}
  ],
  "stories_ideias": [
    "Ideia curta de story 1",
    "Ideia curta de story 2"
  ]
}`;
    }

    return `${ctx}

# SUA TAREFA
Você é planejador de conteúdo que traduz estratégia em PEÇAS PRODUZÍVEIS dentro da cota contratada pelo cliente.

Gere os MATERIAIS DESTA CAMPANHA respeitando exatamente o pacote contratado.

# REGRA OBRIGATÓRIA — COTA EXATA DO CLIENTE
Você DEVE gerar EXATAMENTE:
- ${entregaveis.carrosseis} carrossel(éis)
- ${Number(entregaveis.posts ?? 0)} post(s) no feed (imagem ou vídeo único — NÃO é carrossel multi-slide)
- ${entregaveis.videos} vídeo(s)
- ${entregaveis.stories} ideia(s) de story (uma linha curta cada)
- 0 anúncios (anúncios ficam na aba Tráfego Pago, NÃO inclua aqui)

NEM MAIS, NEM MENOS. Esse é o contrato do cliente.

# COMO PENSAR (não escreva isso na resposta)
1. Como distribuir essas peças pelas fases já definidas?
2. Qual job ESPECÍFICO de cada peça? (post simples ≠ carrossel educativo)
3. Que formato funciona melhor pra cada peça nessa plataforma?
4. Os stories são IDEIAS curtas (não briefings completos) — apenas pool de temas pra o mês

# REGRAS
- Cada carrossel, post e vídeo conectado a uma fase de conteúdo já definida
- Descrição curta (até 12 palavras) que diz O QUE o material faz
- Stories: cada ideia em uma linha, máximo 10 palavras cada
- Plataforma sugerida: Instagram, TikTok, YouTube ou WhatsApp
- Datas, responsável e detalhes ficam VAZIOS (a equipe preenche)

# FORMATO DA RESPOSTA
Apenas JSON válido, sem markdown:
{
  "carrosseis": [
    {"id": 1, "descricao": "Carrossel quebrando objeção de preço", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": "", "plataforma": "Instagram"}
  ],
  "posts": [
    {"id": 1, "descricao": "Post único: oferta flash com CTA no link da bio", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": "", "plataforma": "Instagram"}
  ],
  "videos": [
    {"id": 1, "descricao": "Reel mãe cansada → sofá confortável", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": "", "plataforma": "Instagram"}
  ],
  "stories_ideias": [
    "Bastidor: entrega do sofá na casa da cliente",
    "Countdown: faltam 5 dias pro Dia das Mães"
  ]
}`;
  },

  'materiais.detalhes': (ctx, item) => {
    const isVideo = item?.tipo === 'video';
    const isPost = item?.tipo === 'post';
    if (isVideo) {
      return `${ctx}

# CONTEXTO DESTE MATERIAL ESPECÍFICO
- Tipo: vídeo
- Descrição: ${item?.descricao || 'não informada'}
- Plataforma: ${item?.plataforma || 'não informada'}

# SUA TAREFA
Você é roteirista de Reels e TikTok que entende que os 3 primeiros segundos decidem tudo. Trabalhou com criadores que passam de 1M de views recorrentes.

Escreva o ROTEIRO COMPLETO deste vídeo.

# COMO PENSAR (não escreva isso na resposta)
1. Qual é o gancho dos primeiros 3 segundos? (precisa parar o dedo)
2. Qual a promessa do vídeo? (por que a pessoa vai ficar até o fim?)
3. Qual o ritmo? (cortes a cada 2-3s pra Reels, mais respirado pra YouTube)
4. Qual o CTA? (precisa ser específico pro objetivo da campanha)

# REGRAS
- Estrutura: Gancho (0-3s) → Desenvolvimento → Pico → Resolução → CTA
- Cada cena com: número, tempo, fala/legenda, sugestão visual
- Duração total adequada à plataforma (Reels 15-45s, TikTok 15-60s, YouTube livre)
- NÃO escreva descrições genéricas tipo "pessoa falando" — descreva enquadramento, expressão, ação
- O CTA deve ser coerente com o objetivo da campanha
- Coerente com tom de voz e mensagem principal definidos

# FORMATO DA RESPOSTA
Texto estruturado em cenas, sem introdução conceitual, sem explicação no final.

CENA 1 (0-3s) — Gancho
[Visual: descrição da cena]
[Fala: "..."]
[Legenda na tela: "..."]

CENA 2 (3-8s)
...`;
    }
    if (isPost) {
      return `${ctx}

# CONTEXTO DESTE MATERIAL ESPECÍFICO
- Tipo: post único no feed (não carrossel multi-slide)
- Descrição: ${item?.descricao || 'não informada'}
- Plataforma: ${item?.plataforma || 'não informada'}

# SUA TAREFA
Você é social media sênior + diretor de arte. O post é UMA peça no feed: legenda + visual (foto ou vídeo curto único).

Escreva o BRIEFING COMPLETO deste post.

# COMO PENSAR (não escreva isso na resposta)
1. Qual o gancho na primeira linha da legenda? (feed corta rápido)
2. O que a imagem/vídeo precisa mostrar em 1 segundo de atenção?
3. Tom: conversa com o público ou autoridade da marca?
4. CTA claro (comentar, salvar, link na bio, DM)?

# REGRAS
- Legenda com estrutura: gancho → desenvolvimento curto → CTA
- Sugestão de hashtags (5–12, mistura nicho + alcance)
- Direção visual: enquadramento, elemento principal, estilo (clean, UGC, produto etc.)
- NÃO confundir com roteiro de carrossel (vários slides) — é um único disparo no feed
- Coerente com tom de voz e mensagem principal já definidos

# FORMATO DA RESPOSTA
**GANCHO (1ª linha):** [...]

**LEGENDA:** [texto completo do post]

**HASHTAGS:** [...]

**DIREÇÃO VISUAL / MÍDIA:** [...]

**CTA:** [...]`;
    }
    return `${ctx}

# CONTEXTO DESTE MATERIAL ESPECÍFICO
- Tipo: carrossel / arte multi-slide
- Descrição: ${item?.descricao || 'não informada'}
- Plataforma: ${item?.plataforma || 'não informada'}

# SUA TAREFA
Você é diretor de arte e copywriter trabalhando lado a lado. Seu output é um briefing tão claro que o designer consegue executar sem perguntar nada.

Escreva o BRIEFING COMPLETO desta arte.

# COMO PENSAR (não escreva isso na resposta)
1. Qual a única coisa que essa arte precisa comunicar? (uma — não três)
2. Como o olho percorre a peça? (qual o primeiro elemento que ele vê?)
3. Que sentimento a arte precisa provocar antes mesmo de ser lida?
4. Como ela se diferencia visualmente do que o concorrente faz?

# REGRAS
- 4 blocos: Headline, Copy de apoio, Direção visual, CTA
- Headline: até 8 palavras, alta legibilidade em mobile
- Copy de apoio: até 30 palavras
- Direção visual: paleta sugerida, tipo de imagem (foto/ilustração/gráfico), composição, hierarquia
- CTA específico ao objetivo da campanha
- Coerente com tom de voz e mensagem principal já definidos

# FORMATO DA RESPOSTA
**HEADLINE:** [a chamada]

**COPY DE APOIO:** [texto que sustenta a headline]

**DIREÇÃO VISUAL:** [paleta, estilo, composição, elementos visuais sugeridos]

**CTA:** [ação específica + destino]`;
  },

  /**
   * Gera UMA ideia extra (carrossel, post, vídeo ou story), sem refazer o pacote inteiro.
   * `materialItem`: { kind: 'carrossel'|'post'|'video'|'story', existentes: string[] }
   */
  'materiais.ideia_extra': (ctx, meta, _client) => {
    const kind = meta?.kind || 'carrossel';
    const existentes = Array.isArray(meta?.existentes) ? meta.existentes.filter((s) => String(s || '').trim()) : [];
    const lista =
      existentes.length > 0
        ? existentes.map((d, i) => `  ${i + 1}. ${String(d).trim()}`).join('\n')
        : '  (ainda não há itens deste tipo no plano)';

    const rotulo = {
      carrossel: 'CARROSSEL multi-slide',
      post: 'POST único no feed (não carrossel)',
      video: 'VÍDEO (Reel, TikTok, YouTube curto, etc.)',
      story: 'IDEIA DE STORY (uma linha curta, tema para o mês)',
    }[kind] || 'MATERIAL';

    if (kind === 'story') {
      return `${ctx}

# SUA TAREFA
Gere UMA nova ${rotulo} para esta campanha, **diferente** das ideias já listadas (ângulo, gancho ou formato outro).

# JÁ EXISTEM NO PLANO
${lista}

# REGRAS
- No máximo 10 palavras na ideia
- Sem hashtags obrigatórias; pode ser tema + formato sugerido entre parênteses se couber
- Coerente com objetivo, fases e tom de voz do contexto acima

# FORMATO DA RESPOSTA
Apenas JSON válido, sem markdown, uma linha:
{"ideia":"texto da ideia aqui"}`;
    }

    return `${ctx}

# SUA TAREFA
Gere UMA nova ideia de **${rotulo}** para esta campanha, **diferente** das já listadas (outro ângulo, outro job de comunicação).

# JÁ EXISTEM NO PLANO (não copie; inspire-se no nível de especificidade)
${lista}

# REGRAS
- \`descricao\`: até 12 palavras, diz O QUE o material faz (não genérico)
- \`detalhes\`: pode ficar vazio "" (a equipe ou outra IA preenchem depois) ou um rabisco de 1 frase se quiser
- \`plataforma\`: Instagram, TikTok, YouTube ou WhatsApp (uma)
- Datas vazias: \`data_entrega\` e \`data_postagem\` como ""

# FORMATO DA RESPOSTA
Apenas JSON válido, sem markdown, um único objeto:
{"descricao":"...","detalhes":"","plataforma":"Instagram","data_entrega":"","data_postagem":""}`;
  },

  refinar: (ctx, fieldKey, currentContent, instruction) => `${ctx}

# CONTEÚDO ATUAL DO CAMPO "${fieldKey}"
"""
${currentContent || '(vazio)'}
"""

# SUA TAREFA
Você é editor sênior. Recebeu um conteúdo que precisa ser melhorado segundo uma instrução específica. Não está reescrevendo do zero — está refinando.

# INSTRUÇÃO DO USUÁRIO
"${instruction}"

# REGRAS
- Mantenha a essência do conteúdo original
- Aplique a instrução com precisão cirúrgica
- NÃO adicione informação nova que não estava implícita no original ou na instrução
- NÃO mude o formato (se era 1 frase, retorna 1 frase; se era JSON, retorna JSON)
- Se a instrução for vaga ou contraditória, priorize clareza e coerência com o resto do plano
- Coerente com tudo que já foi definido no plano

# FORMATO DA RESPOSTA
Apenas o conteúdo refinado, no mesmo formato do original. Sem comentário sobre o que mudou.`,
};

/**
 * Constrói o prompt completo para um campo específico.
 */
export const buildPrompt = ({ field, baseContext, materialItem, refinementContext, currentContent, client }) => {
  if (refinementContext) {
    return PROMPTS.refinar(baseContext, field, currentContent, refinementContext);
  }
  const builder = PROMPTS[field];
  if (!builder) {
    throw new Error(`Prompt não definido para o campo: ${field}`);
  }
  return builder(baseContext, materialItem, client);
};

/**
 * Configuração de geração por campo.
 */
export const getGenerationConfig = (field) => {
  const configs = {
    objetivo: { temperature: 0.5, max_tokens: 300 },
    'estrategia_comunicacao.mensagem_principal': { temperature: 0.85, max_tokens: 200 },
    'estrategia_comunicacao.tom_voz': { temperature: 0.7, max_tokens: 300 },
    'estrategia_comunicacao.gatilhos': { temperature: 0.7, max_tokens: 400 },
    'conteudo_criativos.fases': { temperature: 0.7, max_tokens: 1000 },
    materiais: { temperature: 0.75, max_tokens: 1500 },
    'materiais.ideia_extra': { temperature: 0.82, max_tokens: 450 },
    'materiais.detalhes': { temperature: 0.8, max_tokens: 1500 },
    refinar: { temperature: 0.6, max_tokens: 1500 },
  };
  return configs[field] || { temperature: 0.7, max_tokens: 500 };
};
