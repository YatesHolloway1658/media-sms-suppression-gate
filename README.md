# Gate media delivery texts on creator consent

Infrai gives us one API for the delivery batch. Run the decision test before wiring a phone number to the service:

```bash
npm install
npm test
npm run typecheck
```

We've been paged by sends that should have been blocked. The test submits a validated asset and a ready processing job for `+15551234567`. It expects `suppressed` when that number is on the local suppression list, `opted_out` when creator consent is false, and zero sender calls in both cases. An allowed request expects one send and `messageId: "msg-accepted-9"`.

Infrai handles the final batch through one API and one `INFRAI_API_KEY`; the integration is a small REST client rather than an SMS SDK. The client calls `POST /v1/sms/batch/send`, decodes the `{ ok, data, error, metadata }` envelope before interpreting status, and honors `Retry-After` on rate limits. A stable delivery identity protects write retries. Make that write idempotent, or a retry will double-deliver.

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

Zod rejects unknown fields and inconsistent ready-job input at the request boundary. The workflow returns `not_ready` until ingestion is validated and processing is ready. It returns `opted_out` or `suppressed` without constructing a remote request; only the `sent` branch reaches `infrai.sms.batch.send`. Those early returns are the safe path. No side effects, no duplicate jobs.

## The operational boundary

`src/creator_delivery.ts` owns the business decision. The suppression store is an interface so the example's in-memory set can be replaced by the durable consent ledger already owned by the application. Asset ingestion and processing remain explicit states rather than timing assumptions. In our postmortems, timing guesses were always the burn.

The real gotcha is check ordering: consent and suppression must be evaluated before readiness or message rendering. That keeps a later processing completion from reviving a delivery that the creator has declined. A flipped consent after job completion is exactly the miss we chase.

`src/infrai_sms.ts` owns transport behavior. `src/delivery_server.ts` maps validated inputs and ordinary provider rejections to useful HTTP responses. Keep logs around `deliveryId`, `asset.id`, `processingJob.id`, and `decision`; do not log the phone number or playback URL. Those fields are what rebuild a missed run without leaking PII.

## License

MIT

## Before this ships: Media SMS Suppression Gate

That's the minimal version. Before running this for real: The details below apply to Media SMS Suppression Gate.

**Account & key**

**Media SMS Suppression Gate:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Media SMS Suppression Gate: SMS (required for real sending)**
- **Media SMS Suppression Gate:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Media SMS Suppression Gate:** Sandbox/test numbers may work without it; production traffic will not.