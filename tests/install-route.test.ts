import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installRoute } from "../src/ingestion/routes/install.js";

describe("install routes", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(installRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the curl|bash installer", async () => {
    const res = await app.inject({ method: "GET", url: "/install" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/shellscript|text/);
    expect(res.body).toContain("Calyx install");
    expect(res.body).toMatch(/How are apps hosted|What kind of machine/);
    expect(res.body).toContain("calyx-agent.mjs");
    expect(res.body).toContain("PM2");
  });

  it("serves the standalone agent", async () => {
    const res = await app.inject({ method: "GET", url: "/install/calyx-agent.mjs" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("calyx journal");
    expect(res.body).toContain("calyx docker");
    expect(res.body).toContain("calyx pm2");
    expect(res.body).toContain("calyx file");
    expect(res.body).toContain("calyx k8s");
    expect(res.body).toContain("https://calyx-intake.arnabbhowmik.in");
  });
});
