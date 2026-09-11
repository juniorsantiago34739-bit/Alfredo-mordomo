const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const requests = new Map();
const memory = new Map();
const AI_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

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

app.get('/api/health', (req, res) => res.json({ ok: true, mode: AI_KEY ? 'external-free' : 'free-local', version: '4.0' }));

function normalize(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

function rememberFacts(text, session) {
  const t = normalize(text), m = memory.get(session) || {};
  const name = text.match(/(?:meu nome e|me chamo|pode me chamar de)\s+([\p{L}][\p{L}\s]{0,30})/iu);
  if (name) m.name = name[1].trim();
  const city = text.match(/(?:moro em|sou de|vivo em)\s+([\p{L}][\p{L}\s-]{1,40})/iu);
  if (city) m.city = city[1].trim();
  if (t.includes('esqueca meu nome')) delete m.name;
  memory.set(session, m);
  return m;
}

function safeCalc(raw) {
  const expr = normalize(raw).replace(/^(quanto e|calcule|calcula|qual e o resultado de)\s*/i, '').replace(/vezes/g, '*').replace(/x/g, '*').replace(/dividido por/g, '/').replace(/mais/g, '+').replace(/menos/g, '-').replace(/porcento/g, '%').replace(/,/g, '.').replace(/[^0-9+\-*/().%\s]/g, '').trim();
  if (!expr || expr.length > 80 || !/^[0-9+\-*/().%\s]+$/.test(expr)) return null;
  try { const result = Function('"use strict"; return (' + expr + ')')(); return Number.isFinite(result) ? result : null; } catch (_) { return null; }
}

function localReply(text, session) {
  const t = normalize(text), m = rememberFacts(text, session);
  if (/^(oi|ola|oie|e ai|fala|bom dia|boa tarde|boa noite)\b/.test(t)) return m.name ? `Olá, ${m.name}! 🤵 Como posso ajudar?` : 'Olá! 🤵 Sou Alfred, seu mordomo virtual. Como posso ajudar?';
  if (t.includes('quem e voce') || t.includes('o que voce faz')) return 'Sou Alfred, seu mordomo virtual. Tenho IA externa gratuita quando configurada e um modo local de emergência.';
  if (t.includes('meu nome') || t.includes('como eu me chamo')) return m.name ? `Seu nome é ${m.name}. 🤵` : 'Você ainda não me disse seu nome.';
  if (t.includes('onde eu moro') || t.includes('minha cidade')) return m.city ? `Você me disse que mora em ${m.city}.` : 'Você ainda não me informou sua cidade.';
  if (t.includes('hora')) return `Agora são ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. ⏰`;
  if (t.includes('data') || t.includes('que dia') || t.includes('hoje')) return `Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}. 📅`;
  if (t.includes('obrigad') || t.includes('valeu')) return 'Sempre às ordens! 🤵✨';
  if (t.includes('piada')) return 'Por que o computador foi ao médico? Porque estava com um vírus! 😄';
  if (t.includes('estudar') || t.includes('estudo') || t.includes('prova')) return 'Posso montar um resumo, explicar um assunto ou criar perguntas de treino. 📚';
  if (t.includes('jogo') || t.includes('games')) return 'Posso ajudar com estratégias, configurações, ideias e explicações sobre jogos. 🎮';
  if (/^(quanto e|calcule|calcula|qual e o resultado de)\b/.test(t)) { const result = safeCalc(text); if (result !== null) return `O resultado é ${result}. 🧮`; }
  if (t.includes('ajuda') || t === 'comandos') return 'Posso conversar, estudar, programar, calcular, lembrar seu nome/cidade, contar piadas e organizar ideias.';
  return 'A IA externa está indisponível no momento, mas continuo funcionando no modo local. Tente novamente em alguns segundos.';
}

async function externalReply(messages, session) {
  if (!AI_KEY) return null;
  const recent = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12);
  const facts = memory.get(session) || {};
  const system = `Você é Alfred, um mordomo virtual brasileiro: educado, útil, direto e amigável. Responda em português do Brasil. Não diga que é humano. Ajude em estudos, programação, tecnologia, ideias e conversas comuns. Seja conciso quando a pergunta for simples. Memórias desta sessão: nome=${facts.name || 'não informado'}, cidade=${facts.city || 'não informada'}.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AI_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.APP_URL || 'https://alfredo-mordomo-1.onrender.com', 'X-Title': 'Alfredo Mordomo' },
      body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'system', content: system }, ...recent], temperature: 0.7, max_tokens: 700 }),
      signal: controller.signal
    });
    if (!r.ok) return null;
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content;
    return typeof reply === 'string' && reply.trim() ? reply.trim() : null;
  } catch (_) { return null; } finally { clearTimeout(timeout); }
}

app.post('/api/chat', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown', now = Date.now();
    const recent = (requests.get(ip) || []).filter(t => now - t < 60000);
    if (recent.length >= 30) return res.status(429).json({ error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' });
    recent.push(now); requests.set(ip, recent);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const last = messages.slice().reverse().find(m => m && m.role === 'user' && typeof m.content === 'string');
    if (!last || !last.content.trim()) return res.status(400).json({ error: 'Envie uma mensagem.' });
    const session = String(ip);
    rememberFacts(last.content.slice(0, 4000), session);
    const aiReply = await externalReply(messages, session);
    res.json({ reply: aiReply || localReply(last.content.slice(0, 4000), session), ai: Boolean(aiReply) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Não foi possível responder agora.' }); }
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Alfred v4 rodando na porta ${PORT}`));
