import { generateText, Output } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";

import { PlanCoreSchema, PlanSchema, type Plan, type PlanCore } from "@/lib/schema";
import { buildLinearLinks } from "@/lib/linear";
import { planToMarkdown } from "@/lib/markdown";

const PlanRequestSchema = z.object({
  prd: z.string().min(20),
  productName: z.string().optional(),
  targetUser: z.string().optional(),
  platform: z.enum(["web", "mobile", "api", "other"]).optional(),
  constraints: z.string().optional(),
  releaseDate: z.string().optional(),
});

// Prefer setting GROQ_MODEL in .env.local.
// Pick a model that supports structured outputs (json_schema) in Groq.
const MODEL_ID = process.env.GROQ_MODEL ?? "moonshotai/kimi-k2-instruct-0905";

function cleanPrdText(raw: string) {
  let s = raw ?? "";

  // Normalize newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove zero-width and non-breaking spaces
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/\u00A0/g, " ");

  // Fix common PDF hyphenation at line breaks: "inter-\nface" -> "interface"
  s = s.replace(/([A-Za-z])\-\n([A-Za-z])/g, "$1$2");

  // Convert bullets to a consistent marker
  s = s.replace(/[•·●▪︎■]/g, "-");

  // Remove obvious page markers
  s = s.replace(/^\s*Page\s+\d+\s*(of\s+\d+)?\s*$/gim, "");

  // Collapse 3+ newlines to 2
  s = s.replace(/\n{3,}/g, "\n\n");

  // Trim trailing spaces on each line
  s = s
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n");

  // Final trim
  s = s.trim();

  return s;
}

/**
 * Normalize IDs as a last-mile cleanup (only runs after we have a valid object).
 */
function normalizeIds(plan: PlanCore): PlanCore {
  const epics = (plan.epics ?? []).map((e, idx) => ({
    ...e,
    epicId: e.epicId?.trim() ? e.epicId.trim() : `E${idx + 1}`,
  }));

  const epicIdSet = new Set(epics.map((e) => e.epicId));

  const tickets = (plan.tickets ?? []).map((t, idx) => {
    const ticketId = t.ticketId?.trim() ? t.ticketId.trim() : `T${idx + 1}`;
    const epicId = t.epicId?.trim() ? t.epicId.trim() : epics[0]?.epicId || "E1";
    return {
      ...t,
      ticketId,
      epicId: epicIdSet.has(epicId) ? epicId : epics[0]?.epicId || "E1",
    };
  });

  const ticketsByEpic: Record<string, string[]> = {};
  for (const t of tickets) {
    ticketsByEpic[t.epicId] ||= [];
    ticketsByEpic[t.epicId].push(t.ticketId);
  }

  const epicsWithTickets = epics.map((e) => ({
    ...e,
    tickets: ticketsByEpic[e.epicId] ?? [],
  }));

  return { ...plan, epics: epicsWithTickets, tickets };
}

function buildPrompt(input: z.infer<typeof PlanRequestSchema>, cleanedPrd: string) {
  const ctx = {
    productName: input.productName ?? "Unnamed product",
    targetUser: input.targetUser ?? "Not specified",
    platform: input.platform ?? "web",
    constraints: input.constraints ?? "None provided",
    releaseDate: input.releaseDate ?? "Not specified",
  };

  return `
You are a PRD-to-Ticket agent.

Hard requirements:
- Return ONLY a JSON object that matches the provided schema. No markdown. No extra keys.
- Always include EVERY field in the schema for EVERY object.
  - If unknown: use "" for strings, [] for arrays, {} for objects.
- If critical info is missing, add up to 6 clarifying questions to meta.openQuestions, but still produce a best-effort plan.

ID rules (critical for schema validity):
- Epics MUST use epicId values: "E1", "E2", ... sequential.
- Tickets MUST use ticketId values: "T1", "T2", ... sequential.
- Every ticket MUST include "epicId" and it MUST match one of the epics[].epicId values.
- Every epic MUST include a "tickets" array listing ticketIds that belong to that epic.

Quality bar:
- 2-4 epics, 6-10 tickets total.
- Each epic must include at least 2 edgeCases.
- Each ticket must include:
  - at least 3 acceptanceCriteria
  - at least 2 qa.testCases
  - outOfScope for at least ~30% of tickets to show tradeoffs
  - analytics.events with at least 1 event and at least 2 properties

Output guidance:
- Summarize and rephrase, do NOT copy long passages from the PRD verbatim.
- Keep each ticket description to 2-5 lines.
- Keep acceptance criteria and test cases as short bullet-like strings.

Context fields:
- productName: ${ctx.productName}
- targetUser: ${ctx.targetUser}
- platform: ${ctx.platform}
- constraints: ${ctx.constraints}
- releaseDate: ${ctx.releaseDate}

PRD:
${cleanedPrd}
`.trim();
}

async function generatePlanObject(prompt: string, temperature: number) {
  return await generateText({
    model: groq(MODEL_ID),
    temperature,
    prompt,
    output: Output.object({ schema: PlanCoreSchema }),
  });
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = PlanRequestSchema.parse(json);

    const cleanedPrd = cleanPrdText(input.prd);
    const prompt = buildPrompt(input, cleanedPrd);

    let output: PlanCore;

    try {
      const res = await generatePlanObject(prompt, 0);
      output = res.output as PlanCore;
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "unknown";

      const retryPrompt = `
${prompt}

IMPORTANT:
A previous attempt failed schema validation with this error:
${msg}

Fix it by ensuring:
- Every ticket includes epicId and it matches an existing epicId (E1, E2, ...)
- No keys are omitted anywhere
- acceptanceCriteria has 3+ items for every ticket
- qa.testCases has 2+ items for every ticket
- analytics.events has at least 1 event for every ticket
`.trim();

      const res2 = await generatePlanObject(retryPrompt, 0);
      output = res2.output as PlanCore;
    }

    const normalized = normalizeIds(output);

    const planWithExports: Plan = {
      ...normalized,
      exports: { markdown: "", linear: [] },
    };

    planWithExports.exports.linear = buildLinearLinks(planWithExports.tickets);
    planWithExports.exports.markdown = planToMarkdown(planWithExports);

    const validated = PlanSchema.parse(planWithExports);
    return Response.json(validated);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unknown error generating plan.";
    return Response.json({ error: "PLAN_GENERATION_FAILED", message }, { status: 500 });
  }
}
