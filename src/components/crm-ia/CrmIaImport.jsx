import React, { useEffect, useRef, useState } from 'react';
import { CrmIaEditor, CrmIaField } from './CrmIaPrimitives';
import { money, named, parseCrmCsv } from './crmIaPresentation';
import { crmImportColumns, crmImportMapping, prepareCrmImport } from './crmIaImportModel';
import { profileKey, publishedLeadProfiles } from './crmIaLeadModel';

export default function CrmIaImport({ workspace, mutate, onClose }) {
  const [step, setStep] = useState('file');
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState({});
  const [defaults, setDefaults] = useState({ pipeline_id: workspace.pipelines[0]?.id || '', stage_id: '', responsavel_id: '', profile: '' });
  const [review, setReview] = useState([]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const request = useRef(null);
  const fileVersion = useRef(0);
  const columns = crmImportColumns(workspace);
  useEffect(() => () => { fileVersion.current += 1; }, []);
  function open(text) {
    const parsed = parseCrmCsv(text);
    setMapping(crmImportMapping(parsed.headers, columns));
    setTable(parsed); setStep('columns'); setReview([]); setError(''); request.current = null;
  }
  async function file(event) {
    const chosen = event.target.files?.[0]; event.target.value = '';
    if (!chosen) return;
    const version = ++fileVersion.current;
    setReading(true); setError('');
    try { if (chosen.size > 5 * 1024 * 1024) throw new Error('O arquivo deve ter até 5 MB.'); const text = await chosen.text(); if (version === fileVersion.current) open(text); }
    catch (failure) { if (version === fileVersion.current) setError(failure.message); }
    finally { if (version === fileVersion.current) setReading(false); }
  }
  function prepare() {
    setError('');
    try {
      const leads = prepareCrmImport(table, mapping, defaults, workspace);
      const key = JSON.stringify(leads);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      setReview(leads); setStep('review');
    } catch (failure) { setError(failure.message); }
  }
  return <CrmIaEditor title="Importar leads por CSV" description="Arquivo até 5 MB e 1.000 leads. Nenhuma distribuição, IA ou mensagem será acionada pela importação." onClose={onClose} onSave={step === 'review' ? () => mutate('import_leads', { rows: review, request_id: request.current.id }) : undefined} saveLabel={`Confirmar importação de ${review.length} leads`}>
    <ol className="crm-ia-import-steps" aria-label="Etapas de importação"><li aria-current={step === 'file' ? 'step' : undefined}>1. Arquivo</li><li aria-current={step === 'columns' ? 'step' : undefined}>2. Colunas</li><li aria-current={step === 'review' ? 'step' : undefined}>3. Revisão</li></ol>
    {error && <p className="crm-ia-error" role="alert">{error}</p>}
    {step === 'file' && <><label className="crm-ia-field">Arquivo CSV<input aria-label="Arquivo CSV" type="file" accept=".csv,text/csv" disabled={reading} onChange={file} /></label><p className="crm-ia-muted">UTF-8, separado por vírgula ou ponto e vírgula. Nome e telefone são obrigatórios.</p>{reading && <p role="status">Lendo arquivo…</p>}<a className="crm-ia-link-button" download="modelo-leads.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFFnome;telefone;email;valor;etapa;responsavel;perfil;observacoes\n')}`}>Baixar modelo CSV</a></>}
    {step === 'columns' && <><p>{table.rows.length} leads encontrados. Confira cada coluna antes de importar.</p><p className="crm-ia-muted">Etapa, responsável e perfil aceitam ID ou nome inequívoco neste cliente e funil. Células vazias usam os padrões abaixo. Perfis removidos não podem ser atribuídos.</p><div className="crm-ia-form-grid">{columns.map(([key, label]) => <CrmIaField key={key} label={`Coluna para ${label}`} value={mapping[key]} onChange={value => setMapping(old => ({ ...old, [key]: value }))} options={[{ value: '', label: 'Não importar esta coluna' }, ...table.headers.map((header, index) => ({ value: String(index), label: header }))]} />)}<CrmIaField label="Funil da importação" value={defaults.pipeline_id} onChange={pipeline_id => setDefaults(old => ({ ...old, pipeline_id, stage_id: '', profile: '' }))} options={[{ value: '', label: 'Sem funil' }, ...workspace.pipelines]} /><CrmIaField label="Etapa da importação" value={defaults.stage_id} onChange={stage_id => setDefaults(old => ({ ...old, stage_id }))} options={[{ value: '', label: 'Sem etapa' }, ...workspace.stages.filter(stage => stage.pipeline_id === defaults.pipeline_id)]} /><CrmIaField label="Responsável da importação" value={defaults.responsavel_id} onChange={responsavel_id => setDefaults(old => ({ ...old, responsavel_id }))} options={[{ value: '', label: 'Sem responsável' }, ...workspace.people]} /><CrmIaField label="Perfil da importação" value={defaults.profile} onChange={profile => setDefaults(old => ({ ...old, profile }))} options={[{ value: '', label: 'Sem perfil' }, ...publishedLeadProfiles(workspace, defaults.pipeline_id).map(item => ({ value: profileKey(item), label: item.nome }))]} /></div><div className="crm-ia-toolbar"><button type="button" onClick={() => setStep('file')}>Trocar arquivo</button><button type="button" className="crm-ia-primary" onClick={prepare}>Revisar importação</button></div></>}
    {step === 'review' && <><p><strong>{review.length} leads</strong> prontos para a conta <strong>{workspace.client.empresa}</strong>.</p><div className="crm-ia-table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Etapa</th><th>Responsável</th><th>Perfil</th><th>Valor</th><th>Campos personalizados</th></tr></thead><tbody>{review.slice(0, 10).map((lead, index) => <tr key={index}><td>{lead.nome}</td><td>{lead.whatsapp}</td><td>{workspace.stages.find(item => item.id === lead.stage_id)?.nome || 'Sem etapa'}</td><td>{lead.responsavel_id ? named(workspace.people.find(item => item.id === lead.responsavel_id)) : 'Sem responsável'}</td><td>{lead.profile ? workspace.lead_profiles.find(item => profileKey(item) === profileKey(lead.profile))?.nome : 'Sem perfil'}</td><td>{money(lead.valor)}</td><td>{Object.entries(lead.crm_ia_fields || {}).map(([key, value]) => <div key={key}>{columns.find(([, , , field]) => field?.key === key)?.[1] || key}: {String(value)}</div>)}</td></tr>)}</tbody></table></div>{review.length > 10 && <p className="crm-ia-muted">Prévia das primeiras 10 linhas de {review.length}.</p>}<button type="button" onClick={() => setStep('columns')}>Voltar às colunas</button></>}
  </CrmIaEditor>;
}
