import { z } from "zod";

/**
 * Groq structured outputs requirement (json_schema):
 * - For each object, JSON Schema must include a `required` array that lists ALL keys in `properties`.
 * - Avoid .optional() or .default() because it can create schemas that Groq rejects.
 *
 * Reliability tweak:
 * - Use Zod .catch(...) on leaf fields (arrays/strings/objects) so if the model omits a field,
 *   parsing still succeeds and we can enforce quality in route.ts post-processing.
 */

const zStr = z.string().catch("");
const zStrArr = z.array(z.string()).catch([]);

export const PlatformEnum = z.enum(["web", "mobile", "api", "other"]).catch("web");
export const TicketTypeEnum = z.enum(["story", "task", "bug", "spike"]).catch("task");
export const PriorityEnum = z.enum(["P0", "P1", "P2", "P3"]).catch("P2");
export const EstimateEnum = z.enum(["S", "M", "L"]).catch("M");

export const AnalyticsEventSchema = z.object({
  name: zStr,
  properties: zStrArr,
});

const TicketAnalyticsSchema = z
  .object({
    events: z.array(AnalyticsEventSchema).catch([]),
  })
  .catch({ events: [] });

const TicketQASchema = z
  .object({
    testCases: zStrArr,
  })
  .catch({ testCases: [] });

export const TicketSchema = z.object({
  ticketId: zStr,
  epicId: z.string().catch("E1"),
  type: TicketTypeEnum,
  title: zStr,
  userStory: zStr,
  description: zStr,
  acceptanceCriteria: zStrArr,
  outOfScope: zStrArr,
  dependencies: zStrArr,
  priority: PriorityEnum.catch("P2"),  // ADD .catch("P2") HERE
  estimate: EstimateEnum.catch("M"),   // ADD .catch("M") HERE
  labels: zStrArr,
  components: zStrArr,
  analytics: TicketAnalyticsSchema,
  qa: TicketQASchema,
});

export const EpicSchema = z.object({
  epicId: zStr,
  title: zStr,
  outcome: zStr,
  tickets: zStrArr,
  edgeCases: zStrArr,
});

export const PlanCoreSchema = z.object({
  meta: z.object({
    productName: zStr,
    platform: PlatformEnum,
    confidence: z.number().min(0).max(100).catch(70),
    assumptions: zStrArr,
    openQuestions: zStrArr,
  }),
  summary: z.object({
    problem: zStr,
    targetUsers: zStrArr,
    goals: zStrArr,
    nonGoals: zStrArr,
    successMetrics: zStrArr,
  }),
  epics: z.array(EpicSchema).catch([]),
  tickets: z.array(TicketSchema).catch([]),
});

export const PlanSchema = PlanCoreSchema.extend({
  exports: z.object({
    markdown: zStr,
    linear: z
      .array(
        z.object({
          ticketId: zStr,
          linearNewUrl: zStr,
        })
      )
      .catch([]),
  }),
});

export type PlanCore = z.infer<typeof PlanCoreSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type Epic = z.infer<typeof EpicSchema>;
