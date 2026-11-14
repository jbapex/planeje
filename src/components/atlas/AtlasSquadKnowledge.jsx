import React from 'react';
import { Brain, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AtlasSquadKnowledge({ knowledge = [], coverage, clientName, busy, onTeach }) {
  return <section className="atlas-squad-knowledge" aria-label="Conhecimento do Squad">
    <header><Brain size={24} aria-hidden="true" /><div><h2>Ensine o seu Squad</h2><p>Conhecimento de {clientName}. CRM IA, CS IA e Gestor IA usam as orientações confirmadas desta marca.</p></div></header>
    <button className="atlas-button" type="button" disabled={busy} onClick={() => onTeach('Quero ensinar uma orientação ao Squad desta marca. Faça as perguntas necessárias e prepare o conhecimento para minha revisão.')}><Plus size={16} aria-hidden="true" />Ensinar algo novo</button>
    {!knowledge.length && <p className="atlas-context-note">Esta marca ainda não tem orientações confirmadas. Você pode ensinar sobre a empresa, serviços, preços, políticas e tom de atendimento.</p>}
    <div className="atlas-squad-knowledge-list">{knowledge.map(item => <article key={item.id}>
      <header><h3>{item.title || item.topic || 'Orientação confirmada'}</h3><span>Versão {item.version || 1}</span></header>
      <p>{item.content}</p>
      <small>Confirmada por você{item.created_at && <> · {new Date(item.created_at).toLocaleDateString('pt-BR')}</>}</small>
      <div><button type="button" disabled={busy} onClick={() => onTeach(`Quero corrigir esta orientação do Squad: “${item.content}”. Pergunte a nova orientação e prepare a substituição para minha revisão.`)}>Corrigir</button><button type="button" disabled={busy} onClick={() => onTeach(`Quero retirar esta orientação do Squad: “${item.content}”. Confira a orientação vigente e prepare a retirada para minha revisão.`)}>Retirar</button></div>
    </article>)}</div>
    {coverage?.total > knowledge.length && <p className="atlas-context-note">Mostrando {knowledge.length} de {coverage.total} orientações. Peça ao Squad a orientação que deseja consultar.</p>}
    <p className="atlas-context-note">Correções criam uma nova versão. Ensinar ou retirar uma orientação exige sua confirmação na conversa.</p>
  </section>;
}


export function AtlasSquadKnowledgeDialog({ open, onClose, onReturnFocus, ...props }) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent onCloseAutoFocus={event => { if (onReturnFocus) { event.preventDefault(); requestAnimationFrame(onReturnFocus); } }} className="atlas-squad-knowledge-dialog" overlayClassName="bg-black/10">
      <DialogTitle className="sr-only">Conhecimento do Squad</DialogTitle>
      <DialogDescription className="sr-only">Orientações e correções confirmadas da marca atual.</DialogDescription>
      <AtlasSquadKnowledge {...props} />
    </DialogContent>
  </Dialog>;
}
