import { z } from "zod";
import type { SmsSender } from "./infrai_sms.js";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);

export const deliveryRequestSchema = z.object({
  deliveryId: z.string().trim().min(1).max(80),
  creator: z.object({
    id: z.string().trim().min(1).max(80),
    phone,
    smsOptIn: z.boolean(),
  }).strict(),
  asset: z.object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    ingestState: z.enum(["received", "validated"]),
  }).strict(),
  processingJob: z.object({
    id: z.string().trim().min(1).max(80),
    state: z.enum(["queued", "processing", "ready", "failed"]),
    playbackUrl: z.string().url().max(500).optional(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.processingJob.state === "ready" && !value.processingJob.playbackUrl) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["processingJob", "playbackUrl"], message: "required for a ready job" });
  }
});

export type DeliveryRequest = z.infer<typeof deliveryRequestSchema>;
export type DeliveryResult =
  | { decision: "sent"; deliveryId: string; messageId: string }
  | { decision: "suppressed" | "opted_out" | "not_ready"; deliveryId: string };

export interface SuppressionStore {
  has(phoneNumber: string): Promise<boolean>;
}

export class MemorySuppressionStore implements SuppressionStore {
  private readonly entries: Set<string>;

  constructor(phoneNumbers: Iterable<string> = []) {
    this.entries = new Set(phoneNumbers);
  }

  async has(phoneNumber: string): Promise<boolean> {
    return this.entries.has(phoneNumber);
  }
}

export async function deliverCreatorAsset(
  input: DeliveryRequest,
  suppressions: SuppressionStore,
  sender: SmsSender,
): Promise<DeliveryResult> {
  if (!input.creator.smsOptIn) return { decision: "opted_out", deliveryId: input.deliveryId };
  if (await suppressions.has(input.creator.phone)) return { decision: "suppressed", deliveryId: input.deliveryId };
  if (input.asset.ingestState !== "validated" || input.processingJob.state !== "ready") {
    return { decision: "not_ready", deliveryId: input.deliveryId };
  }

  const text = `${input.asset.title} is ready: ${input.processingJob.playbackUrl}`;
  const sent = await sender.send(
    [{ to: input.creator.phone, text }],
    `creator-delivery:${input.deliveryId}`,
  );
  return { decision: "sent", deliveryId: input.deliveryId, messageId: sent.message_id };
}
