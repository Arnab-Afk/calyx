// Convert agent prose (usually GitHub markdown) into Slack Block Kit.
// Slack mrkdwn does not render ## headings, **bold**, or pipe tables.

export const SLACK_REPLY_INSTRUCTIONS = `
You are posting in Slack. Use Slack mrkdwn, not GitHub markdown:
- Bold is *single asterisks*. Never use **double asterisks**.
- Do not use # headings or markdown tables — they show up as raw characters.
- Lead with the finding in 1–2 sentences, then short labeled sections
  (*What we found*, *Why it matters*, *What to do*).
- Use bullets. Stay scannable. Do not write a report or mention tool names.
`;

const SLACK_SECTION_MAX = 2900;
const SLACK_HEADER_MAX = 150;

export function chunkMrkdwn(text: string, max = SLACK_SECTION_MAX): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = remaining.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = max;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** GitHub-flavored markdown → Slack mrkdwn. */
export function gfmToMrkdwn(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/^---+$/gm, "")
    .trim();
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function tableToSection(tableLines: string[]): object {
  const rows = tableLines
    .filter((l) => !isTableSeparator(l))
    .map(splitTableRow)
    .filter((r) => r.length > 0);

  if (rows.length === 0) {
    return {
      type: "section",
      text: { type: "mrkdwn", text: tableLines.join("\n") },
    };
  }

  const headers = rows[0];
  const body = rows.slice(1);

  const lines = body.map((row) => {
    const name = gfmToMrkdwn(row[0] ?? "");
    const rest = row
      .slice(1)
      .map((cell, i) => {
        const header = headers[i + 1] ?? "";
        return header ? `*${header}* ${cell}` : cell;
      })
      .join("  ·  ");
    return rest ? `*${name}*\n${rest}` : `*${name}*`;
  });

  return {
    type: "section",
    text: { type: "mrkdwn", text: lines.join("\n\n").slice(0, SLACK_SECTION_MAX) },
  };
}

function headerBlock(title: string): object {
  const text = title.replace(/\*/g, "").slice(0, SLACK_HEADER_MAX) || "Calyx";
  return {
    type: "header",
    text: { type: "plain_text", text, emoji: true },
  };
}

function sectionBlocks(text: string): object[] {
  return chunkMrkdwn(text).map((chunk) => ({
    type: "section",
    text: { type: "mrkdwn", text: chunk },
  }));
}

/**
 * Turn an agent answer into Slack blocks: headings become headers,
 * markdown tables become labeled rows, the rest becomes mrkdwn sections.
 */
export function markdownToSlackBlocks(markdown: string): object[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: object[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    const text = gfmToMrkdwn(para.join("\n"));
    para = [];
    if (text) blocks.push(...sectionBlocks(text));
  };

  while (i < lines.length) {
    const line = lines[i];
    const heading = line.match(/^(#{1,6})\s+(.+)$/);

    if (heading) {
      flushPara();
      const title = gfmToMrkdwn(heading[2]);
      if (heading[1].length <= 2) {
        blocks.push(headerBlock(title));
      } else {
        blocks.push(...sectionBlocks(`*${title.replace(/\*/g, "")}*`));
      }
      i++;
      continue;
    }

    const next = lines[i + 1];
    if (line.trim().startsWith("|") && next && isTableSeparator(next)) {
      flushPara();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(tableToSection(tableLines));
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }

  flushPara();
  return blocks.length > 0
    ? blocks
    : sectionBlocks(gfmToMrkdwn(markdown) || "_No answer._");
}

export function fallbackText(markdown: string): string {
  return gfmToMrkdwn(markdown).replace(/\n{3,}/g, "\n\n").slice(0, 3500);
}

export function buildLogListBlocks(
  events: { timestamp: string; level: string; service: string; message: string }[],
  title: string
): object[] {
  if (events.length === 0) {
    return [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${title}*\nNo matching events in this window.` },
      },
    ];
  }

  const shown = events.slice(0, 12);
  const lines = shown.map((e) => {
    const t = e.timestamp.slice(11, 19);
    const msg = e.message.replace(/\n/g, " ").slice(0, 90);
    return `\`${e.level}\` *${e.service}*  ${t}  ${msg}`;
  });

  const extra =
    events.length > shown.length
      ? `\n_Showing ${shown.length} of ${events.length} returned events._`
      : "";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: title.slice(0, SLACK_HEADER_MAX), emoji: true },
    },
    ...sectionBlocks(lines.join("\n") + extra),
  ];
}
