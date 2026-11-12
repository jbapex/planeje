export function describeAttachmentDeleteError(error) {
  const message = String(error?.message || '');
  if (
    message.includes('tarefas_production_delivery_attachment_id_fkey')
    || message.includes('production_delivery_attachment_id')
  ) {
    return 'Este link ainda está marcado como comprovante da entrega. Adicione o link correto e tente remover este de novo.';
  }
  if (message.includes('traffic_completion_evidence')) {
    return 'Este anexo está ligado a uma evidência de tráfego e não pôde ser removido.';
  }
  return message || 'Não foi possível remover o anexo.';
}
