const SETTINGS_FIELDS = ['healthy_min', 'result_min', 'attention_min', 'score_drop', 'quiet_days',
  'critical_quiet_days', 'start_hour', 'end_hour', 'weekends', 'radar_enabled'];
const SETTINGS_COLUMNS = ['id', ...SETTINGS_FIELDS, 'task_board_enabled', 'task_automation_enabled', 'task_controls_version'].join(',');

export async function loadCsSettings(db) {
  const { data, error } = await db.from('cs_ia_settings').select(SETTINGS_COLUMNS).eq('id', 1).single();
  if (error || data?.id !== 1) throw new Error('Não foi possível consultar as regras de CS.', { cause: error });
  return data;
}

export async function saveCsSettings(db, draft) {
  const values = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, draft?.[field]]));
  const { healthy_min, result_min, attention_min, score_drop, quiet_days, critical_quiet_days, start_hour, end_hour, weekends, radar_enabled } = values;
  if (SETTINGS_FIELDS.slice(0, 8).some((field) => !Number.isInteger(values[field])) ||
    healthy_min > 100 || healthy_min <= result_min || result_min <= attention_min || attention_min < 1 ||
    score_drop < 1 || score_drop > 100 || quiet_days < 1 || critical_quiet_days <= quiet_days || critical_quiet_days > 90 ||
    start_hour < 0 || end_hour > 24 || start_hour >= end_hour || typeof weekends !== 'boolean' || typeof radar_enabled !== 'boolean') {
    throw new Error('Confira a ordem das faixas, os limites dos gatilhos e o horário de atendimento.');
  }
  const { data, error } = await db.from('cs_ia_settings').update(values).eq('id', 1).select(SETTINGS_COLUMNS).single();
  if (error || data?.id !== 1) throw new Error('Não foi possível salvar as regras de CS.', { cause: error });
  return data;
}

export async function saveCsTaskControls(db, draft) {
  const { task_board_enabled, task_automation_enabled, task_controls_version } = draft || {};
  if (typeof task_board_enabled !== 'boolean' || typeof task_automation_enabled !== 'boolean' ||
    typeof task_controls_version !== 'string' || !task_controls_version) {
    throw new Error('Atualize as opções da sala de Tarefas e tente novamente.');
  }
  const { data, error } = await db.from('cs_ia_settings')
    .update({ task_board_enabled, task_automation_enabled })
    .eq('id', 1).eq('task_controls_version', task_controls_version).select(SETTINGS_COLUMNS).maybeSingle();
  if (!error && !data) throw new Error('O quadro mudou em outra sessão ou seu acesso mudou. Confira as opções atuais.');
  if (error || data?.id !== 1 || data.task_board_enabled !== task_board_enabled ||
    data.task_automation_enabled !== task_automation_enabled) {
    throw new Error('Não foi possível confirmar as opções da sala de Tarefas.', { cause: error });
  }
  return data;
}

const ANALYSIS_COLUMNS = 'id,reading_enabled,transcription_enabled,version';

export async function loadCsAnalysisSettings(db) {
  const { data, error } = await db.from('cs_ia_analysis_settings').select(ANALYSIS_COLUMNS).eq('id', 1).single();
  if (error || data?.id !== 1) throw new Error('Não foi possível consultar as opções de leitura.', { cause: error });
  return data;
}

export async function saveCsAnalysisSettings(db, draft) {
  const { reading_enabled, transcription_enabled, version } = draft || {};
  if (typeof reading_enabled !== 'boolean' || typeof transcription_enabled !== 'boolean' || typeof version !== 'string' || !version) {
    throw new Error('Atualize as opções de leitura e tente novamente.');
  }
  const { data, error } = await db.from('cs_ia_analysis_settings').update({ reading_enabled, transcription_enabled })
    .eq('id', 1).eq('version', version).select(ANALYSIS_COLUMNS).maybeSingle();
  if (!error && !data) throw new Error('As opções mudaram em outra sessão ou seu acesso mudou. Confira os valores atuais.');
  if (error || data?.id !== 1 || data.reading_enabled !== reading_enabled || data.transcription_enabled !== transcription_enabled) {
    throw new Error('Não foi possível confirmar as opções de leitura.', { cause: error });
  }
}
