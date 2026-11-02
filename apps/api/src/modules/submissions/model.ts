import { t } from "elysia";
import { nullable, submissionKind, text } from "../../lib/validation.ts";

export const SubmissionModel = {
  create: t.Object({
    kind: t.Optional(submissionKind),
    note: nullable(4000),
    /** Reported work at the moment of submitting; not the same as task progress. */
    progressPercent: t.Optional(t.Integer({ minimum: 0, maximum: 100 })),
    hoursSpent: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 10000 }), t.Null()])),
    documentIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 20 })),
  }),

  decide: t.Object({
    note: t.Optional(text(2000)),
  }),

  listQuery: t.Object({
    status: t.Optional(
      t.Union([
        t.Literal("pending_review"),
        t.Literal("approved"),
        t.Literal("rejected"),
        t.Literal("revision_required"),
      ]),
    ),
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 50 })),
  }),
};





