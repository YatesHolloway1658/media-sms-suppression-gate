import { deliveryRequestSchema, deliverCreatorAsset, MemorySuppressionStore } from "../src/creator_delivery.js";
import { createInfraiSms } from "../src/infrai_sms.js";

const phone = process.env.DEMO_PHONE;
if (!phone) throw new Error("DEMO_PHONE is required");

const input = deliveryRequestSchema.parse({
  deliveryId: "delivery-demo-001",
  creator: { id: "creator-42", phone, smsOptIn: true },
  asset: { id: "asset-1080p", title: "September studio stream", ingestState: "validated" },
  processingJob: {
    id: "job-transcode-42",
    state: "ready",
    playbackUrl: "https://media.example/streams/asset-1080p",
  },
});

const client = createInfraiSms();
console.log(await deliverCreatorAsset(input, new MemorySuppressionStore(), { send: client.sms.batch.send }));
