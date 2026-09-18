import { describe, it, expect } from "vitest";
import {
  isChitChat,
  shouldHandleUnmentionedReply,
  stripBotMentions,
} from "../src/slack/thread-replies.js";

const base = {
  messageTs: "111.222",
  threadTs: "100.000",
  calyxBotUserId: "UCALYX",
  knownThread: true,
  text: "did they recover?",
};

describe("stripBotMentions", () => {
  it("removes Slack user mentions", () => {
    expect(stripBotMentions("<@UCALYX> status of eventio")).toBe("status of eventio");
  });
});

describe("isChitChat", () => {
  it("treats thanks / ok as chit-chat", () => {
    expect(isChitChat("thanks")).toBe(true);
    expect(isChitChat("ok!")).toBe(true);
    expect(isChitChat("got it")).toBe(true);
  });

  it("does not treat real follow-ups as chit-chat", () => {
    expect(isChitChat("did they recover?")).toBe(false);
    expect(isChitChat("thanks, but is it regional?")).toBe(false);
  });
});

describe("shouldHandleUnmentionedReply", () => {
  it("handles a follow-up in a known thread without @Calyx", () => {
    expect(shouldHandleUnmentionedReply(base)).toBe(true);
  });

  it("ignores top-level channel messages", () => {
    expect(shouldHandleUnmentionedReply({ ...base, threadTs: undefined })).toBe(false);
    expect(shouldHandleUnmentionedReply({ ...base, threadTs: "111.222" })).toBe(false);
  });

  it("ignores threads Calyx has not joined", () => {
    expect(shouldHandleUnmentionedReply({ ...base, knownThread: false })).toBe(false);
  });

  it("lets app_mention own channel @Calyx messages", () => {
    expect(
      shouldHandleUnmentionedReply({ ...base, text: "<@UCALYX> did they recover?" })
    ).toBe(false);
  });

  it("handles DMs even without a prior thread", () => {
    expect(
      shouldHandleUnmentionedReply({
        ...base,
        channelType: "im",
        threadTs: undefined,
        knownThread: false,
        text: "what's broken?",
      })
    ).toBe(true);
  });

  it("ignores bot messages, subtypes, and chit-chat", () => {
    expect(shouldHandleUnmentionedReply({ ...base, botId: "B123" })).toBe(false);
    expect(shouldHandleUnmentionedReply({ ...base, subtype: "message_changed" })).toBe(false);
    expect(shouldHandleUnmentionedReply({ ...base, text: "thanks" })).toBe(false);
    expect(
      shouldHandleUnmentionedReply({ ...base, userId: "UCALYX", calyxBotUserId: "UCALYX" })
    ).toBe(false);
  });
});
