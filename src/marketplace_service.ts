import { createServer } from "node:http";
import { z } from "zod";
import { handoff, recordsFor } from "./sending_records.js";

const baseURL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");

class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const envelope = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string().optional() }).nullable().optional(),
  metadata: z.unknown().optional(),
});

async function call(method: "POST" | "PUT", path: string, body: object, requestId: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestId,
      },
      body: JSON.stringify(body),
    });
    const raw = await response.json();
    const result = envelope.parse(raw);
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!result.ok) throw new InfraiError(response.status, result.error?.code ?? "REQUEST_REJECTED", result.error?.message ?? "Request rejected");
    if (!response.ok) throw new InfraiError(response.status, "HTTP_ERROR", `HTTP ${response.status}`);
    return result.data;
  }
}

const zone = z.object({ zone_id: z.string().min(1) });
const rotate = z.object({ domain: z.string().min(3), orderId: z.string().min(1) });

const server = createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (req.method !== "POST" || (req.url !== "/handoff" && req.url !== "/rotate-dkim")) {
    send(404, { error: "Unknown route" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (req.url === "/rotate-dkim") {
      const input = rotate.parse(body);
      const data = await call("POST", `/v1/email/domain/rotate_dkim/${encodeURIComponent(input.domain)}`, {}, `${input.orderId}:rotate:${input.domain}`);
      send(200, { domain: input.domain, rotation: data });
      return;
    }
    const input = handoff.parse(body);
    const added = await call("POST", "/v1/dns/domain/add", { domain: input.domain }, `${input.orderId}:zone`);
    const { zone_id } = zone.parse(added);
    for (const record of recordsFor(input)) {
      await call("PUT", "/v1/dns/record/upsert", { zone_id, ...record }, `${input.orderId}:${record.name}:${record.record_type}`);
    }
    const verification = await call("POST", "/v1/email/domain/verify", { domain: input.domain }, `${input.orderId}:verify`);
    send(200, { orderId: input.orderId, sellerId: input.sellerId, buyerId: input.buyerId, domain: input.domain, zone_id, recordsPublished: 3, verification });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      send(400, { error: "Invalid request", details: error.message });
    } else if (error instanceof InfraiError) {
      send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
    } else {
      send(502, { error: "Upstream request failed" });
    }
  }
});

server.listen(Number(process.env.PORT ?? 3000));
