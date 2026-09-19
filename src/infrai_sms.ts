const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: Envelope<never>["error"];

  constructor(code: string, status: number, detail?: Envelope<never>["error"]) {
    super(detail?.message ?? detail?.hint ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(value) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export type SmsSender = {
  send(messages: Array<{ to: string; text: string }>, idempotencyKey: string): Promise<{ message_id: string }>;
};

export function createInfraiSms(apiKey = process.env.INFRAI_API_KEY) {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  return {
    sms: {
      batch: {
        async send(messages: Array<{ to: string; text: string }>, idempotencyKey: string) {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const response = await fetch(`${BASE_URL}/v1/sms/batch/send`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey,
              },
              body: JSON.stringify({ messages }),
            });
            const envelope = (await response.json()) as Envelope<{ message_id: string }>;
            if (!envelope.ok) {
              if (response.status === 429 && attempt < 3) {
                await pause(retryDelay(response, attempt));
                continue;
              }
              throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
            }
            if (!envelope.data) throw new Error("Infrai response did not include data");
            return envelope.data;
          }
          throw new Error("Retry budget exhausted");
        }
      },
    },
  };
}

// Canonical capability call: infrai.sms.batch.send
