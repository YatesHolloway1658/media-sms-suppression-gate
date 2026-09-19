import assert from "node:assert/strict";
import test from "node:test";
import { deliveryRequestSchema, deliverCreatorAsset, MemorySuppressionStore } from "../src/creator_delivery.js";
import type { SmsSender } from "../src/infrai_sms.js";

const baseRequest = {
  deliveryId: "delivery-001",
  creator: { id: "creator-42", phone: "+15551234567", smsOptIn: true },
  asset: { id: "asset-9", title: "Live set replay", ingestState: "validated" as const },
  processingJob: { id: "job-9", state: "ready" as const, playbackUrl: "https://media.example/replay/9" },
};

test("suppression and opt-out stop delivery before the sender", async () => {
  let sends = 0;
  const sender: SmsSender = {
    async send() {
      sends += 1;
      return { message_id: "message-should-not-exist" };
    },
  };

  const suppressed = await deliverCreatorAsset(
    deliveryRequestSchema.parse(baseRequest),
    new MemorySuppressionStore([baseRequest.creator.phone]),
    sender,
  );
  const optedOut = await deliverCreatorAsset(
    deliveryRequestSchema.parse({ ...baseRequest, creator: { ...baseRequest.creator, smsOptIn: false } }),
    new MemorySuppressionStore(),
    sender,
  );

  assert.deepEqual(suppressed, { decision: "suppressed", deliveryId: "delivery-001" });
  assert.deepEqual(optedOut, { decision: "opted_out", deliveryId: "delivery-001" });
  assert.equal(sends, 0);
});

test("a ready, allowed asset is sent once with a stable identity", async () => {
  const calls: Array<{ messages: Array<{ to: string; text: string }>; key: string }> = [];
  const sender: SmsSender = {
    async send(messages, key) {
      calls.push({ messages, key });
      return { message_id: "msg-accepted-9" };
    },
  };

  const result = await deliverCreatorAsset(
    deliveryRequestSchema.parse(baseRequest),
    new MemorySuppressionStore(),
    sender,
  );

  assert.deepEqual(result, { decision: "sent", deliveryId: "delivery-001", messageId: "msg-accepted-9" });
  assert.deepEqual(calls, [{
    messages: [{ to: "+15551234567", text: "Live set replay is ready: https://media.example/replay/9" }],
    key: "creator-delivery:delivery-001",
  }]);
});
