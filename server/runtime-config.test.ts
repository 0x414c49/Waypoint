// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtime-config.js";

describe("runtime configuration", () => {
  it("keeps loopback defaults for local production runs", () => {
    const config = parseRuntimeConfig({});

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4173);
    expect(config.allowedHosts).toEqual(new Set(["127.0.0.1:4173", "localhost:4173"]));
    expect(config.allowedMutationOrigins).toEqual(new Set(["http://127.0.0.1:4173", "http://localhost:4173"]));
    expect(config.publicUrl).toBeUndefined();
    expect(config.secureCookies).toBe(false);
    expect(config.serveFrontend).toBe(true);
  });

  it("configures a LAN/reverse-proxy deployment from an exact public URL", () => {
    const config = parseRuntimeConfig({
      JOURNEY_ENV: "production",
      JOURNEY_HOST: "0.0.0.0",
      JOURNEY_PORT: "8080",
      JOURNEY_PUBLIC_URL: "https://waypoint.example.test/",
      JOURNEY_TRUSTED_HOSTS: "waypoint.example.test:8443, 192.168.1.25:8080",
      JOURNEY_TRUSTED_ORIGINS: "https://waypoint.example.test:8443",
      JOURNEY_SECURE_COOKIES: "true",
      JOURNEY_STORE_DIR: "/app/data/store",
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8080);
    expect(config.publicUrl).toBe("https://waypoint.example.test");
    expect(config.allowedHosts).toEqual(new Set([
      "127.0.0.1:8080",
      "localhost:8080",
      "waypoint.example.test",
      "waypoint.example.test:8443",
      "192.168.1.25:8080",
    ]));
    expect(config.allowedMutationOrigins).toEqual(new Set([
      "http://127.0.0.1:8080",
      "http://localhost:8080",
      "https://waypoint.example.test",
      "https://waypoint.example.test:8443",
    ]));
    expect(config.secureCookies).toBe(true);
    expect(config.storeDirectory).toBe("/app/data/store");
    expect(config.mediaDirectory).toBe("/app/data/store/media");
  });

  it("retains development's Vite proxy trust defaults", () => {
    const config = parseRuntimeConfig({ JOURNEY_ENV: "development" });

    expect(config.port).toBe(4174);
    expect(config.allowedHosts).toEqual(new Set([
      "127.0.0.1:5173",
      "localhost:5173",
      "127.0.0.1:4174",
      "localhost:4174",
    ]));
    expect(config.allowedMutationOrigins).toEqual(new Set([
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:4174",
      "http://localhost:4174",
    ]));
    expect(config.serveFrontend).toBe(false);
  });

  it("adds a configured development port to the local trust set", () => {
    const config = parseRuntimeConfig({ JOURNEY_ENV: "development", JOURNEY_PORT: "5000" });

    expect(config.port).toBe(5000);
    expect(config.allowedHosts).toContain("localhost:5000");
    expect(config.allowedMutationOrigins).toContain("http://localhost:5000");
  });

  it("requires explicit public trust configuration when binding all interfaces", () => {
    expect(() => parseRuntimeConfig({ JOURNEY_HOST: "0.0.0.0" })).toThrow(/JOURNEY_PUBLIC_URL/);
    expect(() => parseRuntimeConfig({ JOURNEY_HOST: "0.0.0.0", JOURNEY_TRUSTED_HOSTS: "waypoint.lan:4173" })).toThrow(/JOURNEY_PUBLIC_URL/);
    expect(parseRuntimeConfig({
      JOURNEY_HOST: "0.0.0.0",
      JOURNEY_TRUSTED_HOSTS: "waypoint.lan:4173",
      JOURNEY_TRUSTED_ORIGINS: "http://waypoint.lan:4173",
    }).allowedHosts).toContain("waypoint.lan:4173");
  });

  it.each([
    ["JOURNEY_PORT", "not-a-port"],
    ["JOURNEY_PORT", "0"],
    ["JOURNEY_SECURE_COOKIES", "sometimes"],
    ["JOURNEY_PUBLIC_URL", "https://user:password@example.test"],
    ["JOURNEY_PUBLIC_URL", "ftp://example.test"],
    ["JOURNEY_PUBLIC_URL", "http://*"],
    ["JOURNEY_TRUSTED_HOSTS", "https://example.test"],
    ["JOURNEY_TRUSTED_HOSTS", "*"],
    ["JOURNEY_TRUSTED_ORIGINS", "https://example.test/path"],
    ["JOURNEY_TRUSTED_ORIGINS", "https://*"],
  ])("rejects unsafe %s=%s", (name, value) => {
    expect(() => parseRuntimeConfig({ [name]: value })).toThrow();
  });
});
