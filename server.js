const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const requests = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'free-local' }));

function makeReply(text) {
  const t = text.toLowerCase().trim();
  if (/^(oi|olá|ola|e aí|e ai|bom dia|boa tarde|boa noite)\b/.test(t)) return 'Olá! Sou Alfred, seu mordomo virtual. Como posso ajudar? 🤵';
  if (t.includes('quem é você') || t.includes('quem e voce')) return 'Sou Alfred, seu mordomo virtual. Posso conversar, responder perguntas simples, fazer contas, informar data e hora e ajudar com ideias.';
  if (t.includes('hora')) return `Agora são ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  if (t.includes('data') || t.includes('que dia') || t.includes('dia é hoje') || t.includes('dia e hoje')) return `Hoje é ${new Date().toLocaleDateString('pt-BR')}.`;
  if (t.includes('obrigado') || t.includes('obrigada')) return 'Sempre às ordens! 🤵';
  if (t.includes('piada')) return 'Por que o computador foi ao médico? Porque estava com um vírus! 😄';
  if (t.includes('ajuda')) return 'Claro! Você pode conversar comigo, pedir ideias, perguntar a data ou hora e fazer contas.';
  if (/^(quanto é|quanto e|calcule|calcula)\b/.test(t)) {
    const expr = text.replace(/^(quanto é|quanto e|calcule|calcula)/i, '').replace(/[^0-9+\-*/().,%\s]/g, '').replace(/,/g, '.').trim();
    if (expr && /^[0-9+\-*/().%\s]+$/.test(expr)) {
      try {
        const result = Function(`"use strict"; return (${expr})`)();
        if (Number.isFinite(result)) return `O resultado é ${result}.`;
      } catch (_) {}
    }
  }
  return 'Ainda estou em modo gratuito e sem uma IA externa conectada. Posso responder perguntas simples, fazer contas, informar data e hora e conversar sobre comandos básicos. 🤵';
}

app.post('/api/chat', (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (requests.get(ip) || []).filter(t => now - t < 60000);
    if (recent.length >= 30) return res.status(429).json({ error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' });
    recent.push(now);
    requests.set(ip, recent);

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const last = messages.slice().reverse().find(m => m && m.role === 'user' && typeof m.content === 'string');
    if (!last || !last.content.trim()) return res.status(400).json({ error: 'Envie uma mensagem.' });
    res.json({ reply: makeReply(last.content.slice(0, 4000)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Não foi possível responder agora.' });
  }
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Alfred gratuito rodando na porta ${PORT}`));
