"use strict";

/**
 * Motor de conversa da Nina — mesma lógica do protótipo (triagem inicial,
 * dúvidas frequentes e agendamento), adaptada para rodar num servidor
 * (sem chips clicáveis: as opções são numeradas em texto e o usuário
 * responde com o número ou digitando livremente).
 *
 * Cada sessão é um objeto simples: { state, ctx, options }
 * - state: em qual passo da conversa a pessoa está
 * - ctx: dados coletados (área, nome, telefone, etc.)
 * - options: as últimas opções numeradas oferecidas (para aceitar "1", "2"...)
 */

const MENU_OPTIONS = ["Triagem inicial", "Dúvidas frequentes", "Agendar consulta"];
const FAQ_OPTIONS = ["Áreas de atuação", "Horário de atendimento", "Como funciona a consulta", "Formas de contato"];

const FAQ_ANSWERS = {
  area: "Atuamos com foco em Direito Criminal e Direito Previdenciário, e contamos com uma rede de parceiros especialistas para as demais áreas do direito.",
  horario: "Nosso atendimento é de segunda a sexta, das 9h às 18h. Fora desse horário, deixe sua mensagem que retornamos assim que possível.",
  consulta: "Na primeira consulta entendemos seu caso em detalhes e definimos a melhor estratégia. Pode ser presencial ou por videochamada, como você preferir.",
  contato: "Você pode falar com a gente por este WhatsApp a qualquer momento, ou já agendar uma consulta por aqui mesmo.",
};

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function newSession() {
  return { state: "menu", ctx: {}, options: null };
}

// Se a pessoa respondeu com um número (ex: "2") e havia opções na tela,
// resolve para o texto da opção correspondente. Caso contrário, devolve o texto original.
function resolveInput(session, rawText) {
  const trimmed = String(rawText || "").trim();
  if (session.options && /^[0-9]+$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    if (session.options[idx]) return session.options[idx];
  }
  return rawText;
}

function formatOptions(list) {
  return list.map((label, i) => `${i + 1}) ${label}`).join("\n");
}

function detectIntent(n) {
  if (/crimin|penal|flagrant|pris(a|ao)/.test(n)) return "criminal";
  if (/previdenc|inss|aposent|benefic/.test(n)) return "previdenciario";
  if (/agend|marcar/.test(n)) return "agendar";
  if (/horario|que horas|atende|funciona(mos)?/.test(n)) return "faq-horario";
  if (/endereco|onde fica|localizaca|whatsapp|telefone da (banca|advocacia|firma)|forma(s)? de contato/.test(n)) return "faq-contato";
  if (/area|atuacao|atuam|especialidade/.test(n)) return "faq-area";
  if (/como funciona a consulta|primeira consulta/.test(n)) return "faq-consulta";
  if (/duvida|pergunta|faq/.test(n)) return "faq";
  if (/triagem/.test(n)) return "triagem";
  return null;
}

/**
 * Processa uma mensagem recebida e retorna as respostas da Nina.
 * @param {object} session - sessão da pessoa (mutada in-place)
 * @param {string} rawText - texto recebido no WhatsApp
 * @returns {string[]} lista de mensagens para enviar, em ordem
 */
function handleMessage(session, rawText) {
  const input = resolveInput(session, rawText);
  const n = normalize(input);
  const lines = [];
  let nextOptions = null;

  function say(...msgs) { lines.push(...msgs); }
  function offer(list) { nextOptions = list; }

  function answerFaq(topic) {
    session.state = "faq:menu";
    say(FAQ_ANSWERS[topic]);
    offer(["Outra dúvida", "Voltar ao menu"]);
  }

  function backToMenu() {
    session.state = "menu";
    say("Claro! Como posso ajudar?");
    offer(MENU_OPTIONS);
  }

  function finishTriagem() {
    session.state = "menu";
    const urgenciaTxt = session.ctx.urgente
      ? "Como isso envolve um prazo em aberto, vamos priorizar o seu retorno."
      : "Um de nossos advogados entrará em contato em até 1 dia útil.";
    say(
      `Perfeito. Registrei: ${session.ctx.area} — ${session.ctx.detalhe}.`,
      urgenciaTxt,
      "Posso ajudar em mais alguma coisa?"
    );
    offer(["Dúvidas frequentes", "Agendar consulta", "Encerrar"]);
  }

  function finishAgendamento() {
    session.state = "menu";
    const primeiroNome = session.ctx.nome.split(" ")[0];
    say(
      `Combinado, ${primeiroNome}! Consulta solicitada para ${session.ctx.dia}-feira à ${session.ctx.periodo}.`,
      `Nossa equipe vai confirmar o horário exato pelo telefone ${session.ctx.telefone}.`,
      "Posso ajudar em mais alguma coisa?"
    );
    offer(["Dúvidas frequentes", "Triagem inicial", "Encerrar"]);
  }

  function endConversation() {
    session.state = "end";
    say("Foi um prazer ajudar! Se precisar de mais alguma coisa, é só chamar. Até logo!");
    offer(["Iniciar nova conversa"]);
  }

  if (n === "encerrar" || n === "sair") {
    endConversation();
    session.options = nextOptions;
    return finalize(lines, nextOptions);
  }

  switch (session.state) {
    case "end": {
      Object.assign(session, newSession());
      say(
        "Olá! Eu sou a Nina, assistente virtual da Rodolfo Costa Advocacia.",
        "Posso ajudar com uma triagem inicial do seu caso, esclarecer dúvidas frequentes ou agendar uma consulta. Como posso ajudar?"
      );
      offer(MENU_OPTIONS);
      break;
    }

    case "menu": {
      const intent = detectIntent(n);
      if (intent === "criminal") {
        session.ctx.area = "Direito Criminal";
        session.state = "triagem:criminal:sub";
        say(
          "Entendido — Direito Criminal.",
          "Isso envolve um flagrante ou prisão recente, um inquérito ou processo já em andamento, ou é uma dúvida geral?"
        );
        offer(["Flagrante ou prisão recente", "Inquérito ou processo em andamento", "Dúvida geral"]);
      } else if (intent === "previdenciario") {
        session.ctx.area = "Direito Previdenciário";
        session.state = "triagem:previd:sub";
        say(
          "Entendido — Direito Previdenciário.",
          "Do que se trata: um benefício negado ou cancelado, um novo pedido, ou uma revisão de valor?"
        );
        offer(["Benefício negado ou cancelado", "Novo pedido de benefício", "Revisão de valor"]);
      } else if (intent === "agendar") {
        session.state = "agendar:nome";
        say("Ótimo, vamos agendar sua consulta.", "Qual é o seu nome completo?");
      } else if (intent === "faq-horario") {
        answerFaq("horario");
      } else if (intent === "faq-contato") {
        answerFaq("contato");
      } else if (intent === "faq-area") {
        answerFaq("area");
      } else if (intent === "faq-consulta") {
        answerFaq("consulta");
      } else if (intent === "faq") {
        session.state = "faq:menu";
        say("Claro! Sobre qual assunto você gostaria de saber mais?");
        offer(FAQ_OPTIONS);
      } else if (intent === "triagem") {
        session.state = "triagem:area";
        say("Em qual área seu caso se encaixa melhor?");
        offer(["Direito Criminal", "Direito Previdenciário", "Outra área"]);
      } else {
        say("Não tenho certeza se entendi, mas posso ajudar com:");
        offer(MENU_OPTIONS);
      }
      break;
    }

    case "triagem:area": {
      if (/crimin/.test(n)) {
        session.ctx.area = "Direito Criminal";
        session.state = "triagem:criminal:sub";
        say("Isso envolve um flagrante ou prisão recente, um inquérito ou processo já em andamento, ou é uma dúvida geral?");
        offer(["Flagrante ou prisão recente", "Inquérito ou processo em andamento", "Dúvida geral"]);
      } else if (/previdenc/.test(n)) {
        session.ctx.area = "Direito Previdenciário";
        session.state = "triagem:previd:sub";
        say("Do que se trata: um benefício negado ou cancelado, um novo pedido, ou uma revisão de valor?");
        offer(["Benefício negado ou cancelado", "Novo pedido de benefício", "Revisão de valor"]);
      } else if (/outra/.test(n)) {
        session.state = "triagem:outra:wait";
        say("Sem problema — também atuamos por meio de parceiros especialistas em outras áreas.", "Pode descrever brevemente o assunto?");
      } else {
        say("Pode escolher uma das opções abaixo:");
        offer(["Direito Criminal", "Direito Previdenciário", "Outra área"]);
      }
      break;
    }

    case "triagem:criminal:sub": {
      if (/flagrant|pris/.test(n)) {
        session.ctx.detalhe = "flagrante ou prisão recente";
        session.ctx.urgente = true;
        finishTriagem();
      } else if (/inquerit|processo/.test(n)) {
        session.ctx.detalhe = "inquérito ou processo em andamento";
        session.state = "triagem:criminal:urgencia";
        say("Esse processo tem algum prazo em aberto no momento — como um recurso ou audiência marcada?");
        offer(["Sim, há prazo em aberto", "Não, sem urgência no momento"]);
      } else if (/duvida/.test(n)) {
        session.ctx.detalhe = "uma dúvida geral";
        session.ctx.urgente = false;
        finishTriagem();
      } else {
        say("Pode escolher uma das opções abaixo:");
        offer(["Flagrante ou prisão recente", "Inquérito ou processo em andamento", "Dúvida geral"]);
      }
      break;
    }

    case "triagem:criminal:urgencia": {
      if (/sim/.test(n)) { session.ctx.urgente = true; finishTriagem(); }
      else if (/nao/.test(n)) { session.ctx.urgente = false; finishTriagem(); }
      else {
        say("Só para confirmar: há prazo em aberto ou não?");
        offer(["Sim, há prazo em aberto", "Não, sem urgência no momento"]);
      }
      break;
    }

    case "triagem:previd:sub": {
      if (/negad|cancel/.test(n)) session.ctx.detalhe = "um benefício negado ou cancelado";
      else if (/novo/.test(n)) session.ctx.detalhe = "um novo pedido de benefício";
      else if (/revis/.test(n)) session.ctx.detalhe = "uma revisão de valor";
      else {
        say("Pode escolher uma das opções abaixo:");
        offer(["Benefício negado ou cancelado", "Novo pedido de benefício", "Revisão de valor"]);
        break;
      }
      session.ctx.urgente = false;
      finishTriagem();
      break;
    }

    case "triagem:outra:wait": {
      session.ctx.area = "Outra área";
      session.ctx.detalhe = String(rawText).trim();
      session.ctx.urgente = false;
      finishTriagem();
      break;
    }

    case "faq:menu": {
      if (/outra/.test(n)) {
        say("Sobre qual assunto?");
        offer(FAQ_OPTIONS);
      } else if (/voltar|menu/.test(n)) {
        backToMenu();
      } else {
        const i2 = detectIntent(n);
        if (i2 === "faq-horario") answerFaq("horario");
        else if (i2 === "faq-contato") answerFaq("contato");
        else if (i2 === "faq-area") answerFaq("area");
        else if (i2 === "faq-consulta") answerFaq("consulta");
        else {
          say("Sobre qual desses assuntos você quer saber mais?");
          offer(FAQ_OPTIONS);
        }
      }
      break;
    }

    case "agendar:nome": {
      session.ctx.nome = String(rawText).trim();
      session.state = "agendar:telefone";
      say(`Prazer, ${session.ctx.nome.split(" ")[0]}! Qual o melhor telefone para contato (com DDD)?`);
      break;
    }

    case "agendar:telefone": {
      const digits = String(rawText).replace(/\D/g, "");
      if (digits.length < 8) {
        say("Não consegui identificar um telefone válido. Pode enviar novamente, com DDD?");
        break;
      }
      session.ctx.telefone = String(rawText).trim();
      session.state = "agendar:periodo";
      say("Perfeito. Você prefere atendimento no período da manhã ou da tarde?");
      offer(["Manhã", "Tarde"]);
      break;
    }

    case "agendar:periodo": {
      if (/manh/.test(n)) session.ctx.periodo = "manhã";
      else if (/tard/.test(n)) session.ctx.periodo = "tarde";
      else {
        say("Prefere manhã ou tarde?");
        offer(["Manhã", "Tarde"]);
        break;
      }
      session.state = "agendar:dia";
      say("E qual dia da semana funciona melhor para você?");
      offer(["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]);
      break;
    }

    case "agendar:dia": {
      const dias = { segunda: "segunda", terca: "terça", quarta: "quarta", quinta: "quinta", sexta: "sexta" };
      let found = null;
      Object.keys(dias).forEach((k) => { if (n.indexOf(k) !== -1) found = dias[k]; });
      if (!found) {
        say("Pode escolher um dia da semana:");
        offer(["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]);
        break;
      }
      session.ctx.dia = found;
      finishAgendamento();
      break;
    }

    default:
      backToMenu();
  }

  session.options = nextOptions;
  return finalize(lines, nextOptions);
}

// Junta o texto da resposta com a lista numerada de opções, quando houver.
function finalize(lines, options) {
  const out = lines.slice();
  if (options && options.length) {
    out.push(formatOptions(options));
  }
  return out;
}

// Mensagem de boas-vindas, usada quando um número escreve pela primeira vez.
function greeting() {
  return finalize(
    [
      "Olá! Eu sou a Nina, assistente virtual da Rodolfo Costa Advocacia.",
      "Posso ajudar com uma triagem inicial do seu caso, esclarecer dúvidas frequentes ou agendar uma consulta. Como posso ajudar?",
    ],
    MENU_OPTIONS
  );
}

module.exports = { newSession, handleMessage, greeting, MENU_OPTIONS };
