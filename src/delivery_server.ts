import { createServer } from "node:http";
import { ZodError } from "zod";
import { deliveryRequestSchema, deliverCreatorAsset, MemorySuppressionStore } from "./creator_delivery.js";
import { createInfraiSms, InfraiError } from "./infrai_sms.js";

const port = Number(process.env.PORT ?? 3000);
const suppressed = (process.env.SMS_SUPPRESSION_LIST ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const store = new MemorySuppressionStore(suppressed);

function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method !== "POST" || request.url !== "/creator-deliveries") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const input = deliveryRequestSchema.parse(await readJson(request));
    const client = createInfraiSms();
    const result = await deliverCreatorAsset(input, store, { send: client.sms.batch.send });
    response.writeHead(result.decision === "sent" ? 202 : 200).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "internal_error" }));
  }
}).listen(port, () => console.log(`creator delivery service listening on :${port}`));
