// Decide when an un-@mentioned Slack message should still go to Calyx.
// Once Calyx is in a thread, follow-ups should feel like a conversation.

const CHITCHAT =
  /^(thanks|thank you|thx|ty|tysm|ok|okay|cool|got it|nice|cheers|np|lgtm|👍|🙏|✅)[\s!.]*$/i;

export function stripBotMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/gi, "").trim();
}

export function mentionsUser(text: string, userId: string): boolean {
  return Boolean(userId) && text.includes(`<@${userId}>`);
}

export function isChitChat(text: string): boolean {
  return CHITCHAT.test(text.trim());
}

export function shouldHandleUnmentionedReply(input: {
  subtype?: string;
  botId?: string;
  userId?: string;
  text?: string;
  threadTs?: string;
  messageTs: string;
  channelType?: string;
  calyxBotUserId?: string;
  knownThread: boolean;
}): boolean {
  if (input.subtype) return false;
  if (input.botId) return false;
  if (input.userId && input.calyxBotUserId && input.userId === input.calyxBotUserId) return false;
  if (!input.text?.trim()) return false;

  const isDm = input.channelType === "im";
  const isThreadReply = Boolean(input.threadTs) && input.threadTs !== input.messageTs;

  if (!isDm && !isThreadReply) return false;
  if (!isDm && !input.knownThread) return false;

  // Channel @mentions also fire app_mention — let that handler own them.
  // DMs never get app_mention, so a mention in a DM is still ours.
  if (!isDm && input.calyxBotUserId && mentionsUser(input.text, input.calyxBotUserId)) {
    return false;
  }

  const raw = stripBotMentions(input.text);
  if (!raw) return false;
  if (isChitChat(raw)) return false;
  return true;
}
