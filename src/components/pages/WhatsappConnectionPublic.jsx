import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Copy, Loader2, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONNECTION_TOKEN_PATTERN, normalizePairingPhone, publicWhatsappConnectionRequest } from '@/lib/whatsappConnection';
import './WhatsappConnectionPublic.css';

export default function WhatsappConnectionPublic() {
  const { token = '' } = useParams();
  const [data, setData] = useState({ state: 'loading' }), [mode, setMode] = useState('qr');
  const [phone, setPhone] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false), [copied, setCopied] = useState(false);
  const requestRef = useRef(null), generation = useRef(0);
  const request = useCallback(async (action, values = {}) => {
    if (requestRef.current) return;
    const controller = new AbortController(), current = generation.current;
    requestRef.current = controller; setPending(true); setError('');
    try {
      const next = await publicWhatsappConnectionRequest(action, token, values, controller.signal);
      if (current !== generation.current) return;
      setData((old) => ({ ...old, ...next }));
      if (next.code && !next.qr) setMode('code');
      else if (next.qr && !next.code) setMode('qr');
    } catch (failure) {
      if (failure.name === 'AbortError' || current !== generation.current) return;
      setError(failure.message); setInvalid(Boolean(failure.invalidLink));
      if (action === 'info' || failure.invalidLink) setData((old) => ({ ...old, state: 'unavailable' }));
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setPending(false); }
    }
  }, [token]);

  useEffect(() => {
    generation.current += 1; setData({ state: 'loading' }); setInvalid(false); setPhone('');
    if (!CONNECTION_TOKEN_PATTERN.test(token)) { setInvalid(true); setData({ state: 'unavailable' }); setError('Link inválido ou expirado. Peça um novo link à equipe.'); return undefined; }
    void request('info');
    return () => { generation.current += 1; requestRef.current?.abort(); requestRef.current = null; };
  }, [token, request]);

  useEffect(() => {
    if (data.state !== 'connecting' || invalid) return undefined;
    const timer = setInterval(() => { if (!document.hidden) void request('status'); }, 5000);
    return () => clearInterval(timer);
  }, [data.state, invalid, request]);

  const connected = data.state === 'connected';
  const start = (event) => {
    event.preventDefault();
    const digits = normalizePairingPhone(phone);
    if (mode === 'code' && !digits) { setError('Digite o número com código do país e DDD. Exemplo: 55 11 99999-9999.'); return; }
    void request('connect', { mode, ...(mode === 'code' ? { phone: digits } : {}) });
  };

  return <main className="wa-connect-public">
    <Helmet><title>Conectar WhatsApp · Planeje</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    <header className="wa-connect-public__brand"><img src="/brand/simbolo.png" alt="Planeje" /><span>Conexão do WhatsApp</span></header>
    <section className="wa-connect-public__card" aria-label="Conectar WhatsApp">
      <div className={`wa-connect-public__icon${connected ? ' is-connected' : ''}`}>{connected ? <CheckCircle2 /> : <Smartphone />}</div>
      <h1>{connected ? 'WhatsApp conectado!' : 'Conecte seu WhatsApp'}</h1>
      <p className="wa-connect-public__subtitle">{connected ? 'Tudo pronto. Você já pode fechar esta página.' : data.channel_name || 'Conecte com o aparelho que será usado neste canal.'}</p>
      {data.state === 'loading' ? <p className="wa-connect-public__loading" role="status"><Loader2 className="animate-spin" />Verificando link…</p> : null}
      {error ? <p className="wa-connect-public__error" role="alert">{error}</p> : null}
      {!connected && !invalid && data.state !== 'loading' ? <>
        <Tabs value={mode} onValueChange={(value) => { setMode(value); setError(''); }}>
          <TabsList aria-label="Forma de conexão" className="wa-connect-public__tabs">
            <TabsTrigger value="qr" disabled={pending || data.state === 'connecting'}><QrCode className="h-4 w-4" />QR code</TabsTrigger>
            <TabsTrigger value="code" disabled={pending || data.state === 'connecting'}><Smartphone className="h-4 w-4" />Pelo número</TabsTrigger>
          </TabsList>
        </Tabs>
        <form onSubmit={start} className="wa-connect-public__form">
          {mode === 'code' ? <label>Número do WhatsApp<input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="55 11 99999-9999" disabled={pending || data.state === 'connecting'} /><small>Inclua o código do país e o DDD.</small></label> : null}
          {data.qr ? <div className="wa-connect-public__qr"><img src={data.qr} alt="QR code para conectar este WhatsApp" /></div> : null}
          {data.code ? <div className="wa-connect-public__code"><span>Digite este código no WhatsApp</span><strong>{data.code}</strong><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(data.code.replace(/-/g, '')); setCopied(true); } catch { setError('Copie o código exibido acima.'); } }}><Copy className="h-4 w-4" />{copied ? 'Copiado' : 'Copiar código'}</button></div> : null}
          {data.state === 'connecting' ? <p className="wa-connect-public__loading" role="status"><Loader2 className="animate-spin" />Aguardando confirmação no WhatsApp…</p> : <button className="wa-connect-public__primary" type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'qr' ? <QrCode className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}{mode === 'qr' ? 'Gerar QR code' : 'Gerar código de conexão'}</button>}
          {(data.state === 'connecting' || data.state === 'unavailable') ? <button className="wa-connect-public__refresh" type="button" disabled={pending} onClick={() => void request(data.state === 'unavailable' ? 'info' : 'status')}><RefreshCw className="h-4 w-4" />Verificar conexão</button> : null}
        </form>
        <ol className="wa-connect-public__steps"><li>Abra o WhatsApp no celular do número que você quer conectar.</li><li>Entre em <strong>Aparelhos conectados</strong> e toque em <strong>Conectar um aparelho</strong>.</li><li>{mode === 'qr' ? 'Aponte a câmera para o QR code desta página.' : 'Escolha conectar com número de telefone e digite o código mostrado acima.'}</li></ol>
        <p className="wa-connect-public__note">{mode === 'qr' ? 'Está usando esta página no mesmo celular? Escolha “Pelo número”. ' : ''}Confirme a conexão somente se você recebeu este link da equipe responsável.</p>
      </> : null}
      {invalid ? <p className="wa-connect-public__note">Peça à equipe um novo link de conexão.</p> : null}
    </section>
    <footer>Planeje · Conexão segura do canal</footer>
  </main>;
}
