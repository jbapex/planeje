import { useToast } from '@/components/ui/use-toast';

const escapeCsv = (val) => {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const useLeadsExport = (filteredLeads) => {
  const { toast } = useToast();

  const exportData = () => {
    if (!filteredLeads || filteredLeads.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum dado para exportar',
        description: 'Não há leads para serem exportados com os filtros atuais.',
      });
      return;
    }

    const headers = [
      'ID',
      'Nome',
      'WhatsApp',
      'Email',
      'Data de Entrada',
      'Origem',
      'Sub-Origem',
      'Agendamento',
      'Status',
      'Vendedor',
      'Valor',
      'Observações',
      'Criado Em',
      'Atualizado Em',
    ];
    const rows = filteredLeads.map((lead) => [
      lead.id,
      lead.nome,
      lead.whatsapp,
      lead.email,
      lead.data_entrada,
      lead.origem,
      lead.sub_origem,
      lead.agendamento,
      lead.status,
      lead.vendedor,
      lead.valor,
      lead.observacoes,
      lead.created_at,
      lead.updated_at,
    ]);
    const csvRows = [headers.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))];
    const csv = '\uFEFF' + csvRows.join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({ title: 'Dados exportados!', description: 'O arquivo CSV foi baixado com sucesso.' });
  };

  return { exportData };
};
