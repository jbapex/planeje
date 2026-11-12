/** Versioned work procedures for Atlas. These grant no tools or execution rights. */
const VERSION = '2026-10-08.1';

export const ATLAS_SKILL_CATALOG = Object.freeze([
  {
    id: 'crm.analisar-operacao', agent: 'crm', version: '2026-11-11.1',
    name: 'Analisar CRM e preparar próximos passos',
    description: 'Consulta o funil comercial da conta escolhida e prepara análise ou rascunho com evidência.',
    inputs: ['Conta explicitamente selecionada', 'Período da consulta', 'Lead identificado quando houver ficha'],
    steps: [
      'Sem conta selecionada, peça seleção. Não percorra o catálogo nem escolha um cliente por nome parecido.',
      'Leia crm_ia e preserve período, horário consultado, cobertura e links da fonte autenticada. Não use lead_conversation legado.',
      'Separe agregados completos de listas paginadas. Fonte indisponível e informação não medida não equivalem a zero.',
      'Diferencie qualificação, ganho, perda, fila humana, estado da IA e compromisso realmente gravado. Resposta gerada não confirma envio; agenda do CRM não comprova Google Agenda.',
      'Prepare um próximo passo ou rascunho para revisão. Não envie mensagens, altere registros, ative autonomia ou solicite outro especialista para ampliar acesso.',
    ],
    output: 'Análise comercial curta, evidências e links, limitações de cobertura e próximo passo proposto.',
    checks: ['A conta e o lead permanecem no escopo autenticado.', 'Textos de conversas e notas privadas não entram no modelo.', 'Nenhuma consulta afirma envio ou agendamento executado pelo Atlas.'],
  },
  {
    id: 'clientes.conciliar-alinhamentos', agent: 'clientes', version: VERSION,
    name: 'Conciliar alinhamentos e tarefas',
    description: 'Encontra compromissos confirmados que precisam de um próximo passo.',
    inputs: ['Cliente selecionado', 'Reunião, nota ou alinhamento acessível', 'Tarefas atuais do cliente'],
    steps: [
      'Leia a fonte original e identifique autor, data e cliente. Preserve o trecho que sustenta cada compromisso.',
      'Classifique cada item como ideia, pedido, aprovação ou cancelamento. Uma sugestão ou reação isolada não é aprovação.',
      'Compare entregas aprovadas com tarefas, usando vínculos de projeto/material e conteúdo. Título parecido sozinho não comprova correspondência.',
      'Separe correspondência confirmada, possível duplicidade e entrega sem correspondência na amostra consultada.',
      'Proponha o próximo passo. Responsável e prazo ausentes ficam explicitamente pendentes. Mostre a fonte e os limites da consulta.',
    ],
    output: 'Compromisso, classificação, evidência, tarefa correspondente ou pendência, proposta e campos a definir.',
    checks: ['Três entregas aprovadas e duas tarefas: propor a terceira com sua fonte.', 'Reprocessar a fonte não implica que uma tarefa já foi criada.', 'Correspondência incerta exige revisão.'],
  },
  {
    id: 'clientes.recuperar-contexto', agent: 'clientes', version: VERSION,
    name: 'Recuperar preferências e regras',
    description: 'Prepara o contexto do cliente para decisões e criação.',
    inputs: ['Cliente selecionado', 'Cadastro acessível', 'Memórias confirmadas e fontes do cliente'],
    steps: [
      'Consulte o cadastro e as memórias permitidas do cliente desta conversa.',
      'Separe fatos do cadastro, instruções confirmadas pelo proprietário e interpretações ainda não validadas.',
      'Organize objetivo, público, tom, preferências, restrições e condições de aprovação apenas quando houver fonte.',
      'Em conflito, apresente as versões e a pergunta que resolve a divergência; não substitua uma regra silenciosamente.',
      'Entregue o contexto relevante ao pedido. Sugira uma nova memória quando útil, sem declarar que foi salva.',
    ],
    output: 'Resumo com fontes, regras aplicáveis, lacunas e conflitos a resolver.',
    checks: ['Regra exclusiva do Cliente A não aparece no Cliente B.', 'A consulta geral não reúne memórias privadas de todos os clientes.'],
  },
  {
    id: 'operacao.panorama-decisoes', agent: 'operacao', version: VERSION,
    name: 'Preparar panorama de decisões',
    description: 'Mostra o que depende do proprietário e por quê.',
    inputs: ['Tarefas atuais acessíveis', 'Planos quando um cliente estiver selecionado', 'Horário da consulta'],
    steps: [
      'Leia os registros atuais. Declare recorte, limites e fontes indisponíveis antes de afirmar cobertura completa.',
      'Distingua prazo de produção, prazo da etapa e data de publicação. Produção entregue não continua atrasada pelo mesmo relógio.',
      'Identifique decisões e impedimentos explícitos. Diferencie espera do cliente, trabalho da equipe e decisão do proprietário.',
      'Priorize por compromisso registrado, vencimento e dependência. Não invente pontuação, capacidade ou SLA.',
      'Para cada prioridade, apresente motivo, responsável conhecido, data registrada, fonte e próximo passo proposto.',
    ],
    output: 'Lista curta de decisões prioritárias e próximos passos, com pendências de informação.',
    checks: ['Falha de consulta não vira “tudo em dia”.', 'Sem responsável ou prazo, o resultado indica a ausência.', 'Nenhuma tarefa muda de estado por esta leitura.'],
  },
  {
    id: 'operacao.investigar-bloqueio', agent: 'operacao', version: VERSION,
    name: 'Investigar atrasos e bloqueios',
    description: 'Reconstrói a dependência que está impedindo uma entrega.',
    inputs: ['Tarefa ou entrega identificada', 'Estado atual e comentários acessíveis', 'Regras confirmadas aplicáveis'],
    steps: [
      'Localize a tarefa correta e consulte o estado vigente; não trate a lembrança de uma conversa antiga como estado atual.',
      'Recupere a evidência explícita do bloqueio e a sequência de dependências disponível.',
      'Separe causa registrada de hipótese. Falta de atualização por si só não comprova descumprimento ou responsabilidade pessoal.',
      'Identifique quem precisa agir quando isso estiver nos registros. Não atribua trabalho a alguém por suposição.',
      'Apresente a decisão ou alinhamento necessário e um rascunho de próximo passo; nenhum comentário ou cobrança é enviado.',
    ],
    output: 'Entrega, situação consultada, bloqueio com fonte, dependência, responsável conhecido e proposta para destravar.',
    checks: ['Uma aprovação ausente aparece como dependência, não como tarefa concluída.', 'Informação insuficiente gera uma pergunta específica.'],
  },
  {
    id: 'estrategia.brainstorm', agent: 'estrategia', version: VERSION,
    name: 'Conduzir brainstorm com contexto',
    description: 'Explora caminhos criativos ligados ao objetivo e ao cliente.',
    inputs: ['Objetivo do pedido', 'Público e oferta quando disponíveis', 'Briefing, documentos e regras acessíveis'],
    steps: [
      'Recupere briefing, documentos, planos e memórias pertinentes. Se faltar informação essencial, faça poucas perguntas específicas.',
      'Explicite objetivo, público, oferta, canal e restrições conhecidos. Premissas criativas devem ser identificadas como premissas.',
      'Desenvolva até três caminhos distintos, com conceito, ângulo, exemplo de peça e motivo da escolha.',
      'Avalie adequação ao briefing e viabilidade com os dados disponíveis. Não invente pesquisa, tendências ou resultados anteriores.',
      'Recomende um caminho com justificativa e proponha um experimento ou próximo refinamento.',
    ],
    output: 'Caminhos criativos comparáveis, recomendação justificada e perguntas ou teste proposto.',
    checks: ['Ideia original é apresentada como proposta.', 'Sem acesso à web, referências externas não são descritas como verificadas.', 'Restrições da marca acompanham todos os caminhos.'],
  },
  {
    id: 'estrategia.planejar-campanha', agent: 'estrategia', version: VERSION,
    name: 'Transformar ideia em campanha',
    description: 'Desenvolve conceito, roteiros, textos e uma proposta de entregas.',
    inputs: ['Direção criativa escolhida ou proposta', 'Contexto do cliente', 'Canais e escopo conhecidos'],
    steps: [
      'Distingua direção já aprovada de uma sugestão ainda em discussão. Mostre dependências quando a campanha ainda não tiver briefing suficiente.',
      'Defina mensagem central, promessa sustentada, ângulos e chamada para ação compatíveis com o pedido.',
      'Produza os rascunhos solicitados: roteiro, legenda, copy, pauta ou briefing de peça. Preserve tom e restrições confirmadas.',
      'Organize entregas por material e canal. Um mesmo material multicanal não vira várias unidades de produção sem justificativa.',
      'Prepare a proposta de trabalho para Operação. Datas, orçamento e responsáveis não informados ficam a definir; não crie tarefas ou publique conteúdo.',
    ],
    output: 'Conceito, rascunhos pedidos, materiais/canais, critérios de revisão e campos operacionais pendentes.',
    checks: ['Não apresenta promessa comercial sem suporte.', 'Não afirma que a campanha foi publicada ou agendada.', 'Feedback do usuário pode orientar nova versão sem alterar uma memória automaticamente.'],
  },
]);

export function atlasSkillsForAgent(agent) {
  return ATLAS_SKILL_CATALOG.filter((skill) => skill.agent === agent);
}

export function atlasSkillPrompt(agent) {
  return atlasSkillsForAgent(agent).map((skill) => [
    `Skill: ${skill.name} (${skill.id}@${skill.version})`,
    skill.description,
    `Entradas: ${skill.inputs.join('; ')}.`,
    ...skill.steps.map((step, index) => `${index + 1}. ${step}`),
    `Entrega: ${skill.output}`,
    `Conferência: ${skill.checks.join(' ')}`,
  ].join('\n')).join('\n\n');
}
