"use strict";

require("dotenv").config();
const express = require("express");
const { newSession, handleMessage, greeting } = require("./conversation");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN; // opcional, "Client-Token" da conta Z-API
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // opcional, ver README

// Sessões em memória: telefone -> { state, ctx, options }
// Simples e suficiente para começar. Se o servidor reiniciar, as conversas
// em andamento são perdidas (a pessoa recomeça do menu na próxima mensagem).
// Para produção com mais volume, trocar por um armazenamento persistente
// (ex: Redis, ou uma tabela no banco de dados) usando a mesma interface.
const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, { ...newSession(), isNew: true });
  }
  return sessions.get(phone);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Envia uma mensagem de texto via Z-API.
// Referência: https://developer.z-api.io/ (endpoint "send-text" da instância)
async function sendText(phone, message) {
  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
    console.log(`[SEM ZAPI CONFIGURADO] Responderia para ${phone}: ${message}`);
    return;
  }
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
  const headers = { "Content-Type": "application/json" };
  if (ZAPI_CLIENT_TOKEN) headers["Client-Token"] = ZAPI_CLIENT_TOKEN;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Falha ao enviar mensagem via Z-API (${res.status}): ${body}`);
  }
}

// Envia várias mensagens em sequência, com uma pequena pausa entre elas
// (evita que cheguem todas coladas e simula um ritmo de digitação natural).
async function sendReplies(phone, lines) {
  for (const line of lines) {
    await sendText(phone, line);
    await sleep(700);
  }
}

// Extrai { phone, text } do formato de webhook da Z-API.
// IMPORTANTE: confirme o formato exato no painel da sua conta Z-API
// (Webhooks > "Ao receber") antes de colocar em produção — provedores
// ajustam esses campos com alguma frequência.
function parseIncoming(body) {
  if (!body) return null;
  if (body.fromMe) return null; // ignora mensagens enviadas pelo próprio número
  if (body.isGroup) return null; // ignora mensagens de grupo

  const phone = body.phone || body.from;
  const text =
    (body.text && body.text.message) ||
    (body.message && body.message.text) ||
    body.body ||
    null;

  if (!phone || !text) return null;
  return { phone: String(phone), text: String(text) };
}

app.get("/", (_req, res) => {
  res.send("Nina está no ar.");
});

// Endpoint de teste local, sem depender do WhatsApp:
// curl -X POST http://localhost:3000/test -H "Content-Type: application/json" \
//   -d '{"phone":"5511999999999","text":"quero agendar uma consulta"}'
app.post("/test", async (req, res) => {
  const { phone, text } = req.body || {};
  if (!phone || !text) return res.status(400).json({ error: "envie { phone, text }" });

  const session = getSession(phone);
  const replies = [];
  if (session.isNew) {
    session.isNew = false;
    replies.push(...greeting());
    session.options = require("./conversation").MENU_OPTIONS;
  }
  replies.push(...handleMessage(session, text));
  res.json({ replies, state: session.state });
});

app.post("/webhook", async (req, res) => {
  // resposta imediata: o processamento e envio seguem em segundo plano
  res.sendStatus(200);

  if (WEBHOOK_SECRET && req.query.secret !== WEBHOOK_SECRET) return;

  const incoming = parseIncoming(req.body);
  if (!incoming) return;

  try {
    const session = getSession(incoming.phone);
    const outgoing = [];
    if (session.isNew) {
      session.isNew = false;
      outgoing.push(...greeting());
      session.options = require("./conversation").MENU_OPTIONS;
    }
    outgoing.push(...handleMessage(session, incoming.text));
    await sendReplies(incoming.phone, outgoing);
  } catch (err) {
    console.error("Erro ao processar mensagem:", err);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor da Nina rodando na porta ${PORT}`);
});
