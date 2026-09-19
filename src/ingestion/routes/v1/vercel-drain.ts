import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getLogSourceById, touchLogSource } from "../../../storage/projects.js";
import { enqueueEvents } from "../../queue.js";
import { normalizeVercelDrain } from "../../vercel-normalize.js";

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyVercelSignature(
  secret: string,
  rawBody: string,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha1", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqualHex(expected, signature);
}

/**
 * Vercel Log Drain receiver.
 *
 * Handshake: unsigned probe may include `x-vercel-verify` — echo it on 200.
 * Deliveries: HMAC-SHA1 of raw body in `x-vercel-signature` (hex, no prefix).
 *
 * Docs: https://vercel.com/docs/drains/security
 */
export async function vercelDrainRoute(app: FastifyInstance): Promise<void> {
  const rawParser = (
    _req: unknown,
    body: Buffer,
    done: (err: Error | null, body?: unknown) => void
  ) => {
    try {
      const raw = body.toString("utf8");
      done(null, raw);
    } catch (err) {
      done(err as Error, undefined);
    }
  };

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, rawParser);
  app.addContentTypeParser("application/x-ndjson", { parseAs: "buffer" }, rawParser);
  app.addContentTypeParser("text/plain", { parseAs: "buffer" }, rawParser);

  app.post("/v1/drains/vercel/:sourceId", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const source = await getLogSourceById(sourceId);
    if (!source || source.provider !== "vercel") {
      return reply.status(404).send({ error: "Unknown Vercel drain source" });
    }
    if (!source.drainSecret) {
      return reply.status(500).send({ error: "Drain secret missing for source" });
    }

    const verifyHeader = request.headers["x-vercel-verify"] as string | undefined;
    const signature = request.headers["x-vercel-signature"] as string | undefined;
    const rawBody =
      typeof request.body === "string"
        ? request.body
        : Buffer.isBuffer(request.body)
          ? request.body.toString("utf8")
          : "";

    // Endpoint ownership probe (unsigned) — echo verify header and stop.
    if (verifyHeader && !signature) {
      reply.header("x-vercel-verify", verifyHeader);
      return reply.status(200).send({ ok: true });
    }

    if (!verifyVercelSignature(source.drainSecret, rawBody, signature)) {
      return reply.status(403).send({
        code: "invalid_signature",
        error: "signature didn't match",
      });
    }

    let events;
    try {
      events = normalizeVercelDrain(rawBody, {
        tenantId: source.tenantId,
        projectId: source.projectId,
        sourceId: source.id,
        service: source.service,
        role: source.role,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Failed to parse drain body",
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    if (events.length > 0) {
      await enqueueEvents(events);
      await touchLogSource(source.id);
    }

    return reply.status(200).send({ received: events.length });
  });
}
