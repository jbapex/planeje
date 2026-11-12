import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { publishChannelToMeta } from '@/lib/publishChannelToMeta';
import {
  combineLocalDateAndTime,
  describeScheduleSaveError,
  futureScheduleAt,
  localDateTimeInputValue,
  parseLocalDateTimeInput,
} from '@/lib/scheduleSocialComposer';
import { describeMetaPublishError } from '@/lib/metaInstagramSchedule';

function splitWhen(value) {
  const [date, time] = String(value || '').split('T');
  return { date: date || '', time: (time || '').slice(0, 5) };
}

export default function FailedPublicationActions({ publication, clientId, onDone }) {
  const { toast } = useToast();
  const [when, setWhen] = useState(() => splitWhen(localDateTimeInputValue(futureScheduleAt())));
  const [busy, setBusy] = useState('');

  const run = async (publishNow) => {
    if (!publication?.id) return;
    const scheduledAt = publishNow
      ? null
      : futureScheduleAt(parseLocalDateTimeInput(combineLocalDateAndTime(when.date, when.time)));
    if (!publishNow && !scheduledAt) {
      toast({ title: 'Escolha data e hora', variant: 'destructive' });
      return;
    }
    setBusy(publishNow ? 'now' : 'later');
    try {
      const result = await publishChannelToMeta(publication, {
        clientId,
        publishNow,
        scheduledAt,
      });
      toast({
        title: result.held ? 'Reagendado' : (result.scheduled ? 'Agendado na Meta' : 'Enviado'),
        description: result.held
          ? `O Instagram recebe em ${when.date} ${when.time}. Não vai ao ar agora.`
          : (result.permalink || undefined),
      });
      onDone?.(result.publication);
    } catch (err) {
      toast({
        title: publishNow ? 'Não deu para enviar' : 'Não deu para reagendar',
        description: publishNow ? describeMetaPublishError(err) : describeScheduleSaveError(err),
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="social-pub-retry" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div className="social-pub-retry-when">
        <label>
          <span>Data</span>
          <input
            type="date"
            value={when.date}
            onChange={(event) => setWhen((current) => ({ ...current, date: event.target.value }))}
            disabled={Boolean(busy)}
          />
        </label>
        <label>
          <span>Hora</span>
          <input
            type="time"
            value={when.time}
            onChange={(event) => setWhen((current) => ({ ...current, time: event.target.value }))}
            disabled={Boolean(busy)}
          />
        </label>
      </div>
      <div className="social-pub-retry-actions">
        <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => void run(false)}>
          {busy === 'later' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Reagendar
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void run(true)}>
          {busy === 'now' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Enviar agora
        </Button>
      </div>
    </div>
  );
}
