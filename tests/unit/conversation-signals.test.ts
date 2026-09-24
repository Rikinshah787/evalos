import { describe, expect, it } from "vitest";
import { analyzeConversation } from "@/lib/conversation-signals";

describe("conversation signals", () => {
  it("detects correction-heavy abandoned chats", () => {
    const signals = analyzeConversation(
      [
        { role: "user", content: "Fix the refund flow" },
        { role: "assistant", content: "Done." },
        { role: "user", content: "No, I meant the checkout refund" },
        { role: "assistant", content: "Updated." },
        { role: "user", content: "That's not working again" }
      ],
      "Still looking"
    );

    expect(signals.correctionTurns).toBeGreaterThanOrEqual(2);
    expect(signals.unansweredUserAsk || signals.likelyAbandoned).toBe(true);
    expect(["abandoned", "correction_heavy"]).toContain(signals.conversationShape);
  });
});
