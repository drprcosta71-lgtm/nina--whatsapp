# Nina no WhatsApp — guia de colocação no ar

Este pacote transforma o protótipo visual da Nina em um bot que responde de
verdade no WhatsApp Business do escritório, usando a mesma lógica de
triagem inicial, dúvidas frequentes e agendamento já validada no protótipo.

Caminho escolhido: **Z-API** — conecta o número de WhatsApp Business que
você já usa (via QR code, como o WhatsApp Web), sem precisar passar pela
verificação de empresa da Meta. É a forma mais rápida de colocar a Nina
para funcionar de verdade. Vale saber: por não ser a API oficial da Meta,
existe um risco (baixo, mas real) de bloqueio do número em caso de uso fora
das regras do WhatsApp — evite disparos em massa ou mensagens não
solicitadas.

## O que você precisa ter em mãos

- O número de WhatsApp Business do escritório, com o app instalado em um
  celular (mesmo que você não vá mais usá-lo manualmente depois).
- Um cartão para o plano pago da Z-API (eles cobram por instância conectada;
  confira o valor atual em z-api.io — não é gratuito para uso contínuo).

## Passo 1 — Criar a instância na Z-API

1. Acesse **z-api.io** e crie uma conta.
2. Crie uma nova instância (é ela que vai representar o número do escritório).
3. No painel da instância, escaneie o QR code com o WhatsApp do celular do
   escritório (Configurações → Aparelhos conectados → Conectar um aparelho).
4. Depois de conectado, anote dois valores que aparecem no painel: o
   **ID da instância** e o **Token**.
5. Em "Segurança", veja se sua conta exige um **Client-Token** — se sim,
   anote também.

## Passo 2 — Configurar o projeto

1. Copie `.env.example` para `.env`.
2. Preencha `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` e (se aplicável)
   `ZAPI_CLIENT_TOKEN` com os valores do Passo 1.
3. Instale as dependências:
   ```
   npm install
   ```

## Passo 3 — Testar a conversa sem depender do WhatsApp ainda

```
npm start
```

Em outro terminal:
```
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"phone":"5511999999999","text":"quero agendar uma consulta"}'
```

Isso devolve em JSON o que a Nina responderia — útil para revisar os
textos antes de ligar ao WhatsApp de verdade. Repita com o mesmo `phone`
para continuar a mesma conversa (a Nina lembra em que passo cada número
está).

## Passo 4 — Colocar o servidor no ar

O servidor precisa de um endereço público na internet, porque a Z-API
envia as mensagens recebidas para ele (webhook). A forma mais simples,
sem custo para o volume de um escritório iniciando, é o **Railway**:

1. Crie uma conta em railway.app (dá para entrar com GitHub).
2. Suba este projeto para um repositório no GitHub (ou use o botão
   "Deploy from local folder" do Railway, se disponível).
3. No Railway, crie um novo projeto a partir desse repositório.
4. Em "Variables", cadastre as mesmas variáveis do seu `.env`
   (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `WEBHOOK_SECRET`).
5. Após o deploy, o Railway te dá uma URL pública, algo como
   `https://nina-whatsapp-production.up.railway.app`.

(Render.com funciona de forma equivalente, caso prefira.)

## Passo 5 — Apontar o webhook da Z-API para o servidor

1. No painel da Z-API, vá em **Webhooks → Ao receber**.
2. Cole a URL pública do Passo 4 seguida de `/webhook`, por exemplo:
   `https://nina-whatsapp-production.up.railway.app/webhook`
3. Se você definiu `WEBHOOK_SECRET` no `.env`, adicione
   `?secret=SEU_VALOR` no final da URL, e configure o mesmo valor no Railway.
4. Salve.

## Passo 6 — Testar de verdade

Mande uma mensagem de outro celular para o número do escritório. A Nina
deve responder em poucos segundos. Teste os três fluxos (triagem, dúvidas,
agendamento) como você já testou no protótipo visual.

## Importante: confirme o formato do webhook

Provedores como a Z-API ajustam o formato dos campos do webhook de tempos
em tempos. A função `parseIncoming` em `server.js` foi escrita para o
formato mais comum (`phone`, `text.message`), mas antes de ir para
produção, envie uma mensagem de teste e confira nos logs do Railway o
corpo exato que chegou em `/webhook` — ajuste `parseIncoming` se os nomes
dos campos forem diferentes na sua conta.

## Limitações desta primeira versão (e próximos passos sugeridos)

- **Sem botões de verdade**: o WhatsApp comum não permite os mesmos botões
  clicáveis do protótipo web nesta configuração simplificada; a Nina numera
  as opções (1, 2, 3...) e aceita tanto o número quanto o texto digitado.
- **Memória em memória**: se o servidor reiniciar, conversas em andamento
  se perdem (a pessoa recomeça do início na próxima mensagem). Para mais
  volume, vale trocar por um banco de dados simples (ex: Redis).
- **Agendamento não cai em nenhuma agenda real**: hoje a Nina só confirma
  por texto. Um próximo passo natural é integrar com Google Agenda, ou
  enviar uma notificação (e-mail, Slack, outro WhatsApp) para a secretária
  a cada novo agendamento.
- **Textos**: revise as respostas em `conversation.js` com calma antes de
  divulgar o número — são as mesmas do protótipo, mas vale o escritório
  aprovar o tom final.

## Estrutura dos arquivos

- `conversation.js` — toda a lógica de conversa (a "cabeça" da Nina).
- `server.js` — o servidor que recebe e envia mensagens via Z-API.
- `.env.example` — modelo de configuração.
