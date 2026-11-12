import React, { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AtendimentoForwardDialog({
  open,
  onOpenChange,
  conversations = [],
  currentConversationId,
  sourceMessage,
  onConfirm,
  sending,
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const options = useMemo(() => {
    let list = conversations.filter((c) => c.id !== currentConversationId);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) => {
      const name = (c.display_name || '').toLowerCase();
      const jid = (c.chat_jid || '').toLowerCase();
      return name.includes(q) || jid.includes(q);
    });
  }, [conversations, currentConversationId, search]);

  const handleOpenChange = (next) => {
    if (!next) {
      setSearch('');
      setSelected(null);
    }
    onOpenChange(next);
  };

  const preview = sourceMessage?.body?.trim() || 'Mensagem';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encaminhar mensagem</DialogTitle>
        </DialogHeader>
        <p className="wa-text-caption truncate px-1">“{preview.slice(0, 80)}{preview.length > 80 ? '…' : ''}”</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <ul className="max-h-[280px] overflow-y-auto border rounded-lg divide-y">
          {options.length === 0 ? (
            <li className="p-4 wa-text-caption text-center">Nenhuma conversa encontrada.</li>
          ) : (
            options.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors',
                    selected?.id === conv.id && 'bg-[var(--wa-brand-light)]'
                  )}
                  onClick={() => setSelected(conv)}
                >
                  <p className="wa-list-name truncate">{conv.display_name || conv.chat_jid}</p>
                  <p className="wa-list-preview truncate">{conv.last_message_preview || conv.chat_jid}</p>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="wa-btn-resolve"
            disabled={!selected || sending}
            onClick={() => onConfirm(selected)}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Encaminhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
