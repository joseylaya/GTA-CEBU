import { MessageCircle, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ordered = (messages = []) => [...messages].sort((a, b) => a.id.localeCompare(b.id));

export default function ChatSupport() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/support/conversation', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setConversation(body.data);
      setMessages(ordered(body.data?.messages));
      setError('');
    } catch { setError('Support is reconnecting. Please try again shortly.'); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!open || !conversation) return undefined;
    const timer = window.setInterval(load, conversation.ai_pending ? 1500 : 4000);
    return () => window.clearInterval(timer);
  }, [open, conversation, load]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    if (window.innerWidth < 640) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  async function start() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/support/conversation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ context: { page_path: pathname } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setConversation(body.data); setMessages(ordered(body.data.messages));
    } catch (problem) { setError(problem.message || 'Support is temporarily unavailable.'); }
    finally { setBusy(false); }
  }

  async function send(event) {
    event.preventDefault();
    const content = text.trim();
    if (!content || busy || !conversation) return;
    const clientMessageId = crypto.randomUUID();
    setMessages((items) => [...items, { id: clientMessageId, sender_type: 'CUSTOMER', content, delivery_status: 'PENDING' }]);
    setText(''); setBusy(true); setError('');
    try {
      const response = await fetch('/api/support/conversation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, clientMessageId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setMessages((items) => items.map((item) => item.id === clientMessageId ? body.data : item));
      window.setTimeout(load, 400);
    } catch (problem) {
      setMessages((items) => items.map((item) => item.id === clientMessageId ? { ...item, delivery_status: 'FAILED' } : item));
      setError(problem.message || 'Message could not be sent.');
    } finally { setBusy(false); }
  }

  if (pathname.startsWith('/admin')) return null;
  const human = ['HUMAN_ACTIVE', 'AI_PAUSED'].includes(conversation?.mode);

  return <>
    <button className="support-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="court-support"><MessageCircle/><span>Chat support</span></button>
    {open && <section id="court-support" className="support-window" aria-label="Court support chat">
      <header><div className="support-avatar">PK</div><div><strong>Picklr Support</strong><small><i className={human ? 'human' : ''}/>{human ? 'Human support' : 'Online'}</small></div><button onClick={() => setOpen(false)} aria-label="Close chat"><X/></button></header>
      {!conversation ? <div className="support-welcome"><MessageCircle/><h3>How can we help?</h3><p>Ask ALAS Support about booking, payments, schedules, or general questions.</p><small>This temporary demo uses the existing ALAS assistant.</small><button className="btn btn-primary" disabled={busy} onClick={start}>{busy ? 'Connecting…' : 'Start chat'}</button>{error && <em>{error}</em>}</div> : <>
        <div className="support-messages" aria-live="polite">
          <div className="support-intro">You’re connected to ALAS Support. A court-specific assistant will replace this after approval.</div>
          {messages.map((message) => <div key={message.id} className={`support-message ${message.sender_type === 'CUSTOMER' ? 'mine' : ''}`}><p>{message.content}</p>{message.delivery_status === 'PENDING' && <small>Sending…</small>}{message.delivery_status === 'FAILED' && <small>Failed to send</small>}</div>)}
          {conversation.ai_pending && <div className="support-typing" aria-label="Assistant is typing"><i/><i/><i/></div>}
          <div ref={bottom}/>
        </div>
        <form className="support-compose" onSubmit={send}><label className="sr-only" htmlFor="court-support-message">Message</label><textarea id="court-support-message" rows="1" maxLength="2000" value={text} onChange={(event) => setText(event.target.value)} placeholder="Type your message…"/><button disabled={!text.trim() || busy} aria-label="Send message"><Send/></button></form>
        {error && <p className="support-error">{error}</p>}
      </>}
    </section>}
  </>;
}
