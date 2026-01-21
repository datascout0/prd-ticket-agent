import type { Ticket } from "./schema";

function encodeForQuery(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function buildLinearNewUrl(title: string, description: string): string {
  const t = encodeForQuery(title);
  const d = encodeForQuery(description);
  return `https://linear.new?title=${t}&description=${d}`;
}

export function buildLinearLinks(tickets: Ticket[]): { ticketId: string; linearNewUrl: string }[] {
  return tickets.map((t) => ({
    ticketId: t.ticketId,
    linearNewUrl: buildLinearNewUrl(t.title, ticketMarkdownDescription(t)),
  }));
}

function ticketMarkdownDescription(t: Ticket): string {
  const lines: string[] = [];
  lines.push(`Type: ${t.type}`);
  lines.push(`Priority: ${t.priority}`);
  lines.push(`Estimate: ${t.estimate}`);
  lines.push("");
  lines.push(`User story: ${t.userStory}`);
  lines.push("");
  lines.push(t.description);
  lines.push("");
  lines.push("Acceptance criteria:");
  for (const ac of t.acceptanceCriteria) lines.push(`- ${ac}`);

  if (t.outOfScope?.length) {
    lines.push("");
    lines.push("Out of scope:");
    for (const os of t.outOfScope) lines.push(`- ${os}`);
  }

  if (t.dependencies?.length) {
    lines.push("");
    lines.push("Dependencies:");
    for (const dep of t.dependencies) lines.push(`- ${dep}`);
  }

  lines.push("");
  lines.push("QA test cases:");
  for (const tc of t.qa.testCases) lines.push(`- ${tc}`);

  lines.push("");
  lines.push("Analytics:");
  for (const ev of t.analytics.events) {
    lines.push(`- ${ev.name} (${ev.properties.join(", ")})`);
  }

  return lines.join("\n");
}
