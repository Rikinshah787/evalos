import type { AgentMessage, AgentRun } from "./types";

export type ConversationSignals = {
  userTurns: number;
  assistantTurns: number;
  correctionTurns: number;
  nudgeStreak: number;
  likelyAbandoned: boolean;
  lastSpeaker: "user" | "assistant" | "unknown";
  correctionExcerpts: string[];
  unansweredUserAsk: boolean;
  conversationShape: "one_shot" | "back_and_forth" | "correction_heavy" | "abandoned";
};

const CORRECTION_RE =
  /\b(no[,.]?\s|nope|wrong|not what i|i meant|i said|actually[, ]|try again|that'?s not|don'?t|stop|instead|redo|revert)\b/i;

const FRUSTRATION_RE =
  /\b(frustrated|annoying|broken|waste|useless|give up|this isn'?t working|still failing|third time|again!?)\b/i;

/** Signals people usually forget: corrections, nudges, abandonment, unanswered asks. */
export function analyzeConversation(input: AgentMessage[], finalOutput = ""): ConversationSignals {
  const userTurns = input.filter((item) => item.role === "user").length;
  const assistantTurns = input.filter((item) => item.role === "assistant").length;
  const last = input[input.length - 1];
  const lastSpeaker =
    last?.role === "user" ? "user" : last?.role === "assistant" ? "assistant" : "unknown";

  const correctionExcerpts = input
    .filter((item) => item.role === "user" && CORRECTION_RE.test(item.content))
    .map((item) => item.content.slice(0, 160));

  let nudgeStreak = 0;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    if (input[i]?.role === "user") nudgeStreak += 1;
    else break;
  }

  const unansweredUserAsk = lastSpeaker === "user";
  const frustrated = input.some((item) => item.role === "user" && FRUSTRATION_RE.test(item.content));
  const likelyAbandoned =
    unansweredUserAsk ||
    (frustrated && !/done|fixed|works|thanks/i.test(finalOutput)) ||
    nudgeStreak >= 3;

  let conversationShape: ConversationSignals["conversationShape"] = "one_shot";
  if (likelyAbandoned) conversationShape = "abandoned";
  else if (correctionExcerpts.length >= 2) conversationShape = "correction_heavy";
  else if (userTurns >= 2) conversationShape = "back_and_forth";

  return {
    userTurns,
    assistantTurns,
    correctionTurns: correctionExcerpts.length,
    nudgeStreak,
    likelyAbandoned,
    lastSpeaker,
    correctionExcerpts: correctionExcerpts.slice(-3),
    unansweredUserAsk,
    conversationShape
  };
}

export function attachConversationSignals(run: AgentRun): AgentRun {
  const signals = analyzeConversation(run.input, run.finalOutput);
  return {
    ...run,
    metadata: {
      ...run.metadata,
      userTurns: signals.userTurns,
      assistantTurns: signals.assistantTurns,
      correctionTurns: signals.correctionTurns,
      nudgeStreak: signals.nudgeStreak,
      likelyAbandoned: signals.likelyAbandoned,
      unansweredUserAsk: signals.unansweredUserAsk,
      conversationShape: signals.conversationShape,
      correctionExcerpts: signals.correctionExcerpts.join(" || ") || null
    }
  };
}
