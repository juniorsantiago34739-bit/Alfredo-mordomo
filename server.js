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

app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'free-local', version: '3.0' }));

const memory = new Map();

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function rememberFacts(text, session) {
  const t = normalize(text);
  const m = memory.get(session) || {};
  const name = text.match(/(?:meu nome e|me chamo|pode me chamar de)\s+([\p{L}][\p{L}\s]{0,30})/iu);
  if (name) m.name = name[1].trim();
  const city = text.match(/(?:moro em|sou de|vivo em)\s+([\p{L}][\p{L}\s-]{1,40})/iu);
  if (city) m.city = city[1].trim();
  if (t.includes('esqueca meu nome')) delete m.name;
  memory.set(session, m);
  return m;
}

function safeCalc(raw) {
  let expr = normalize(raw)
    .replace(/^(quanto e|calcule|calcula|qual e o resultado de)\s*/i, '')
    .replace(/vezes/g, '*').replace(/x/g, '*').replace(/dividido por/g, '/')
    .replace(/mais/g, '+').replace(/menos/g, '-').replace(/porcento/g, '%')
    .replace(/,/g, '.').replace(/[^0-9+\-*/().%\s]/g, '').trim();
  if (!expr || expr.length > 80 || !/^[0-9+\-*/().%\s]+$/.test(expr)) return null;
  try {
    const result = Function('"use strict"; return (' + expr + ')')();
    return Number.isFinite(result) ? result : null;
  } catch (_) { return null; }
}

function makeReply(text, session) {
  const t = normalize(text);
  const m = rememberFacts(text, session);

  if (/^(oi|ola|oie|e ai|fala|bom dia|boa tarde|boa noite)\b/.test(t)) {
    return m.name ? `Olá, ${m.name}! 🤵 É um prazer atendê-lo novamente. Como posso ajudar?` : 'Olá! 🤵 Sou Alfred, seu mordomo virtual. Como posso ajudar?';
  }
  if (t.includes('quem e voce') || t.includes('o que voce faz') || t.includes('o que sabe fazer')) {
    return 'Sou Alfred, seu mordomo virtual. Posso conversar, lembrar informações desta sessão, fazer cálculos, informar data e hora, contar piadas, ajudar nos estudos, explicar tecnologia e orientar você em vários assuntos. 🧠';
  }
  if (t.includes('meu nome') || t.includes('como eu me chamo')) {
    return m.name ? `Seu nome é ${m.name}. 🤵` : 'Você ainda não me disse seu nome. Pode dizer: “meu nome é ...”.';
  }
  if (t.includes('onde eu moro') || t.includes('minha cidade')) {
    return m.city ? `Você me disse que mora em ${m.city}.` : 'Você ainda não me informou sua cidade.';
  }
  if (t.includes('hora')) return `Agora são ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. ⏰`;
  if (t.includes('data') || t.includes('que dia') || t.includes('hoje')) return `Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}. 📅`;
  if (t.includes('obrigad') || t.includes('valeu')) return 'Sempre às ordens! 🤵✨';
  if (t.includes('piada')) return 'Por que o computador foi ao médico? Porque estava com um vírus! 😄';
  if (t.includes('motivacao') || t.includes('desanimado') || t.includes('desanimo')) return 'Vamos por partes. Escolha uma tarefa pequena, comece por 5 minutos e avance um passo de cada vez. Você não precisa resolver tudo de uma vez. 💪';
  if (t.includes('estudar') || t.includes('estudo') || t.includes('prova')) return 'Claro! Posso montar um resumo, explicar um assunto de forma simples, criar perguntas de treino ou montar um plano de estudos. 📚';
  if (t.includes('tecnologia') || t.includes('computador') || t.includes('celular') || t.includes('programar') || t.includes('codigo')) return 'Posso ajudar com tecnologia e programação. Diga o que você quer fazer e, se houver um erro, envie a mensagem do erro para eu analisar. 💻';
  if (t.includes('jogo') || t.includes('games')) return 'Posso ajudar com estratégias, configurações, ideias de jogos e explicações sobre mecânicas. 🎮';
  if (t.includes('ajuda') || t === 'comandos') return 'Comandos que entendo: “que horas são”, “qual a data”, “quanto é 25 vezes 4”, “meu nome é...”, “moro em...”, “conte uma piada”, “quero estudar” e “ajuda”.';
  if (/^(quanto e|calcule|calcula|qual e o resultado de)\b/.test(t)) {
    const result = safeCalc(text);
    if (result !== null) return `O resultado é ${result}. 🧮`;
  }
  if (t.includes('bom') && (t.includes('trabalho') || t.includes('emprego'))) return 'Uma boa estratégia é identificar uma habilidade que você já tem, melhorar essa habilidade e procurar oportunidades compatíveis. Se quiser, posso ajudar a montar um plano.';
  if (t.includes('ideia') || t.includes('ideias')) return 'Claro! Posso gerar ideias para projetos, jogos, vídeos, estudos, sites e conteúdo. Diga o tema e eu monto algumas opções. 💡';
  if (t.includes('como fazer') || t.includes('me ensina')) return 'Claro. Diga exatamente o que você quer aprender e eu explico passo a passo, começando pelo mais simples. 🤵';
  if (t.includes('obrigado') || t.includes('obrigada')) return 'Sempre às ordens, senhor. 🤵';

  return 'Entendi. Ainda estou funcionando sem uma IA externa, então não tenho conhecimento geral ilimitado. Mas posso tentar ajudar com cálculos, estudos, tecnologia, ideias, jogos, data, hora e comandos. Se você me disser o objetivo, eu tento dividir a tarefa em passos. 🧠';
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
    const session = String(ip);
    res.json({ reply: makeReply(last.content.slice(0, 4000), session) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Não foi possível responder agora.' });
  }
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Alfred gratuito v3 rodando na porta ${PORT}`));
