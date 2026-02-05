import React, { useState, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || c === '\n' || c === '\r') {
      result.push(current.trim());
      current = '';
      if (c === '\n' || c === '\r') break;
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
};

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
};

const mapRowToLead = (row) => {
  const nome = row.nome || row.name || '';
  const whatsapp = (row.whatsapp || row.telefone || row.phone || '').replace(/\D/g, '');
  const email = row.email || '';
  const origem = row.origem || row.origem_do_lead || '';
  const sub_origem = row.sub_origem || '';
  const data_entrada = row.data_entrada || row.data_de_entrada || new Date().toISOString().split('T')[0];
  const status = row.status || 'agendado';
  const vendedor = row.vendedor || '';
  const valor = parseFloat(row.valor || row.value || '0') || 0;
  const observacoes = row.observacoes || row.observacao || '';
  return { nome, whatsapp: whatsapp || null, email: email || null, origem: origem || null, sub_origem: sub_origem || null, data_entrada, status, vendedor: vendedor || null, valor, observacoes: observacoes || null };
};

const ImportLeadsModal = ({ isOpen, onClose, onImport }) => {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result || '';
        const rows = parseCsv(text);
        const leads = rows.map(mapRowToLead).filter((l) => l.nome || l.whatsapp);
        setPreview(leads);
      } catch (err) {
        toast({ variant: 'destructive', title: 'Erro ao ler arquivo', description: err.message });
        setPreview([]);
      }
    };
    reader.readAsText(f, 'UTF-8');
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      toast({ variant: 'destructive', title: 'Nenhum lead', description: 'O arquivo não contém leads válidos (nome ou WhatsApp).' });
      return;
    }
    setLoading(true);
    try {
      const result = await onImport(preview);
      toast({
        title: 'Importação concluída',
        description: result?.createdCount != null ? `${result.createdCount} leads importados.` : 'Leads importados.',
      });
      onClose();
      setFile(null);
      setPreview([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro na importação', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar leads (CSV)</DialogTitle>
          <DialogDescription>
            Selecione um arquivo CSV com colunas: nome, whatsapp, email, origem, status, vendedor, valor, observacoes (opcionais).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label>Arquivo CSV</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>
          {preview.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {preview.length} lead(s) encontrado(s) no arquivo.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={preview.length === 0 || loading}>
            {loading ? 'Importando...' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportLeadsModal;
