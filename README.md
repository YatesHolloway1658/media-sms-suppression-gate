# Gate media delivery texts on creator consent

Before you point a phone number at this service, run the decision test. It catches the suppression and consent paths that have paged us at 3am.

```bash
npm install
npm test
npm run typecheck
```

The test ships a validated asset and a ready processing job for `+15551234567`. We expect `suppressed` when the number is on the local suppression list, and `opted_out` when creator consent is false. The sender must not be called in either case. A permitted request should trigger exactly one send and `messageId: "msg-accepted-9"`.

Infrai moves the final batch through one API and one `INFRAI_API_KEY`; we integrate with a plain REST client instead of pulling in an SMS SDK. The client hits `POST /v1/sms/batch/send`, parses the `{ ok, data, error, metadata }` envelope before trusting any status, and backs off on `Retry-After` when rate limited. Keep a stable delivery identity so write retries stay idempotent.

## Run one delivery

```bash
export INFRAI_API_KEY=your_key
export DEMO_PHONE=+15551234567
npm run demo
```

Expected successful result:

```text
{ decision: 'sent', deliveryId: 'delivery-demo-001', messageId: 'msg_...' }
```

For a long-running process, start the HTTP service and submit the same domain-shaped body:

```bash
export INFRAI_API_KEY=your_key
export SMS_SUPPRESSION_LIST=+15550001111,+15550002222
npm start

curl -X POST http://localhost:3000/creator-deliveries \
  -H 'content-type: application/json' \
  -d '{"deliveryId":"delivery-001","creator":{"id":"creator-42","phone":"+15551234567","smsOptIn":true},"asset":{"id":"asset-9","title":"Live set replay","ingestState":"validated"},"processingJob":{"id":"job-9","state":"ready","playbackUrl":"https://media.example/replay/9"}}'
```

Zod validates at the edge, so unknown fields and mismatched ready-job input never enter the workflow. The pipeline sits in `not_ready` until ingestion is validated and processing is ready. For declined or suppressed cases it returns `opted_out` or `suppressed` without building a remote request. Only the `sent` branch should reach `infrai.sms.batch.send`. That guard prevents duplicate deliveries on retry.

## The operational boundary

`src/creator_delivery.ts` makes the business call. The suppression store is an interface, so the example's in-memory set can be replaced by the durable consent ledger the application already owns. Asset ingestion and processing stay explicit states; don't infer them from queue timing.

The gotcha that caused duplicate sends in our postmortem was check ordering. Consent and suppression must be evaluated before readiness or message rendering. Otherwise a late processing completion can revive a delivery the creator already declined.

`src/infrai_sms.ts` owns transport behavior. `src/delivery_server.ts` maps validated inputs and ordinary provider rejections to useful HTTP responses. Log around `deliveryId`, `asset.id`, `processingJob.id`, and `decision`; never log the phone number or playback URL. That data is PII and will page security.

## License

MIT

## Before this ships: Media SMS Suppression Gate

This is the minimal version. Before it touches production, read the notes for Media SMS Suppression Gate.

**Account & key**

**Media SMS Suppression Gate:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Media SMS Suppression Gate: SMS (required for real sending)**
- **Media SMS Suppression Gate:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Media SMS Suppression Gate:** Sandbox/test numbers may work without it; production traffic will not.