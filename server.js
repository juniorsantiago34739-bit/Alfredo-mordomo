require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: !!client }));

app.post('/api/chat', async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: 'IA não configurada no servidor.' });
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const safe = messages.slice(-12).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!safe.length) return res.status(400).json({ error: 'Envie uma mensagem.' });

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-mini',
      messages: [
        { role: 'system', content: 'Você é Alfred, um mordomo virtual educado, prestativo, direto e amigável. Responda em português do Brasil por padrão. Não invente capacidades.' },
        ...safe
      ],
      temperature: 0.7,
      max_tokens: 700
    });
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) return res.status(502).json({ error: 'A IA não retornou uma resposta.' });
    res.json({ reply: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao conversar com a IA. Verifique a configuração da chave e do modelo.' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Alfred rodando na porta ${PORT}`));
