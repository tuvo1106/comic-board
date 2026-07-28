import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configuredProviders,
  defaultProvider,
  getProvider,
  isProviderId,
  resolveProvider,
} from "./index";
import { MetadataError } from "./types";

const KEY = "METRON_API_KEY";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY];
});
afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("isProviderId", () => {
  it("recognizes only known providers", () => {
    expect(isProviderId("metron")).toBe(true);
    expect(isProviderId("comicvine")).toBe(false);
    expect(isProviderId("nope")).toBe(false);
  });
});

describe("configuredProviders / defaultProvider", () => {
  it("reflects whether the Metron key is set", () => {
    process.env[KEY] = "token";
    expect(configuredProviders()).toEqual(["metron"]);
    expect(defaultProvider()).toBe("metron");

    delete process.env[KEY];
    expect(configuredProviders()).toEqual([]);
    expect(defaultProvider()).toBeNull();
  });
});

describe("resolveProvider", () => {
  it("throws 501 when nothing is configured", () => {
    delete process.env[KEY];
    expect(() => resolveProvider(null)).toThrow(MetadataError);
    expect(() => resolveProvider("metron")).toThrow(/not configured/);
  });

  it("falls back to the default when no provider is requested", () => {
    process.env[KEY] = "token";
    expect(resolveProvider(null)).toBe("metron");
    expect(resolveProvider(undefined)).toBe("metron");
  });

  it("honors a valid, configured provider request", () => {
    process.env[KEY] = "token";
    expect(resolveProvider("metron")).toBe("metron");
  });

  it("rejects an unknown provider with 400", () => {
    process.env[KEY] = "token";
    try {
      resolveProvider("comicvine");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MetadataError);
      expect((e as MetadataError).status).toBe(400);
    }
  });
});

describe("getProvider", () => {
  it("builds the Metron provider when configured", () => {
    process.env[KEY] = "token";
    expect(getProvider("metron").id).toBe("metron");
  });

  it("throws 501 when the key is missing", () => {
    delete process.env[KEY];
    try {
      getProvider("metron");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MetadataError).status).toBe(501);
    }
  });
});
