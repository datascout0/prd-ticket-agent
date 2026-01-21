import type { Plan, Ticket } from "./schema";

export function ticketToMarkdown(t: Ticket): string {
  const parts: string[] = [];
  parts.push(`### ${t.ticketId} - ${t.title}`);
  parts.push(`Type: ${t.type} | Priority: ${t.priority} | Estimate: ${t.estimate}`);
  parts.push("");
  parts.push(`User story: ${t.userStory}`);
  parts.push("");
  parts.push(t.description);
  parts.push("");
  parts.push("Acceptance criteria:");
  for (const ac of t.acceptanceCriteria) parts.push(`- ${ac}`);

  if (t.outOfScope?.length) {
    parts.push("");
    parts.push("Out of scope:");
    for (const os of t.outOfScope) parts.push(`- ${os}`);
  }

  if (t.dependencies?.length) {
    parts.push("");
    parts.push("Dependencies:");
    for (const dep of t.dependencies) parts.push(`- ${dep}`);
  }

  parts.push("");
  parts.push("QA test cases:");
  for (const tc of t.qa.testCases) parts.push(`- ${tc}`);

  parts.push("");
  parts.push("Analytics events:");
  for (const ev of t.analytics.events) {
    parts.push(`- ${ev.name}`);
    for (const p of ev.properties) parts.push(`  - ${p}`);
  }

  return parts.join("\n");
}

export function planToMarkdown(plan: Plan): string {
  const lines: string[] = [];

  lines.push(`# ${plan.meta.productName} - Ticket Pack`);
  lines.push("");
  lines.push(`Platform: ${plan.meta.platform} | Confidence: ${plan.meta.confidence}/100`);
  lines.push("");

  lines.push("## Summary");
  lines.push(`Problem: ${plan.summary.problem}`);
  lines.push("");
  lines.push("Target users:");
  for (const u of plan.summary.targetUsers) lines.push(`- ${u}`);
  lines.push("");
  lines.push("Goals:");
  for (const g of plan.summary.goals) lines.push(`- ${g}`);
  lines.push("");
  lines.push("Non-goals:");
  for (const ng of plan.summary.nonGoals) lines.push(`- ${ng}`);
  lines.push("");
  lines.push("Success metrics:");
  for (const sm of plan.summary.successMetrics) lines.push(`- ${sm}`);
  lines.push("");

  lines.push("## Assumptions");
  for (const a of plan.meta.assumptions) lines.push(`- ${a}`);
  lines.push("");

  if (plan.meta.openQuestions?.length) {
    lines.push("## Open questions");
    for (const q of plan.meta.openQuestions) lines.push(`- ${q}`);
    lines.push("");
  }

  lines.push("## Epics");
  for (const e of plan.epics) {
    lines.push(`### ${e.epicId} - ${e.title}`);
    lines.push(`Outcome: ${e.outcome}`);
    lines.push("Tickets:");
    for (const tid of e.tickets) lines.push(`- ${tid}`);
    lines.push("Edge cases:");
    for (const ec of e.edgeCases) lines.push(`- ${ec}`);
    lines.push("");
  }

  lines.push("## Tickets");
  lines.push("");
  for (const t of plan.tickets) {
    lines.push(ticketToMarkdown(t));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
