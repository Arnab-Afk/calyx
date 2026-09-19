import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CalyxClient, formatMessage } from "./client.js";
import { resolveConfigFromEnv } from "./env.js";

describe("formatMessage", () => {
  it("joins args", () => {
    expect(formatMessage(["a", 1, { b: 2 }])).toBe('a 1 {"b":2}');
  });

  it("uses Error stack when present", () => {
    const err = new Error("boom");
    expect(formatMessage([err])).toContain("boom");
  });
});

describe("resolveConfigFromEnv", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    delete process.env.CALYX_INTAKE_URL;
    delete process.env.CALYX_SOURCE_TOKEN;
    delete process.env.NEXT_PUBLIC_CALYX_INTAKE_URL;
    delete process.env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("returns null when missing", () => {
    expect(resolveConfigFromEnv()).toBeNull();
  });

  it("reads CALYX_* env", () => {
    process.env.CALYX_INTAKE_URL = "http://localhost:13000/v1/logs";
    process.env.CALYX_SOURCE_TOKEN = "calyx_src_test";
    const cfg = resolveConfigFromEnv({}, "node");
    expect(cfg?.intakeUrl).toBe("http://localhost:13000/v1/logs");
    expect(cfg?.token).toBe("calyx_src_test");
  });

  it("browser prefers NEXT_PUBLIC_*", () => {
    process.env.CALYX_INTAKE_URL = "http://a/v1/logs";
    process.env.CALYX_SOURCE_TOKEN = "a";
    process.env.NEXT_PUBLIC_CALYX_INTAKE_URL = "http://b/v1/logs";
    process.env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN = "b";
    const cfg = resolveConfigFromEnv({}, "browser");
    expect(cfg?.intakeUrl).toBe("http://b/v1/logs");
    expect(cfg?.token).toBe("b");
  });

  it("node prefers CALYX_* over NEXT_PUBLIC_*", () => {
    process.env.CALYX_INTAKE_URL = "http://a/v1/logs";
    process.env.CALYX_SOURCE_TOKEN = "server-token";
    process.env.NEXT_PUBLIC_CALYX_INTAKE_URL = "http://b/v1/logs";
    process.env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN = "public-token";
    const cfg = resolveConfigFromEnv({}, "node");
    expect(cfg?.intakeUrl).toBe("http://a/v1/logs");
    expect(cfg?.token).toBe("server-token");
    expect(cfg?.service).toBe("api");
  });
});

describe("CalyxClient", () => {
  it("batches and posts with Bearer token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ received: 1 }), { status: 202 });
    });

    const client = new CalyxClient({
      intakeUrl: "http://localhost:13000/v1/logs",
      token: "calyx_src_abc",
      service: "web",
      batchSize: 2,
      flushIntervalMs: 0,
      fetch: fetchMock as unknown as typeof fetch,
    });

    client.error("one");
    expect(fetchMock).not.toHaveBeenCalled();
    client.error("two");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toHaveLength(2);
    expect(body[0].level).toBe("error");
    expect(body[0].service).toBe("web");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer calyx_src_abc",
    });

    client.destroy();
  });

  it("flush sends remaining events", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    const client = new CalyxClient({
      intakeUrl: "http://localhost:13000/v1/logs",
      token: "calyx_src_abc",
      flushIntervalMs: 0,
      fetch: fetchMock as unknown as typeof fetch,
    });
    client.info("hello");
    await client.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.destroy();
  });
});
