import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _clearCache, cached } from "./cache";

beforeEach(() => _clearCache());
afterEach(() => vi.useRealTimers());

describe("cached", () => {
  it("runs fn once for a key and returns the cached value on a hit", async () => {
    const fn = vi.fn(async () => 42);
    expect(await cached("k", fn)).toBe(42);
    expect(await cached("k", fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refetches once the entry's ttl has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fn = vi.fn(async () => "v");
    await cached("k", fn, 100);
    vi.setSystemTime(50);
    await cached("k", fn, 100); // still fresh
    expect(fn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(200);
    await cached("k", fn, 100); // expired
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a thrown error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(cached("k", fn)).rejects.toThrow("boom");
    await expect(cached("k", fn)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry past capacity", async () => {
    // Insert 501 distinct keys (MAX_ENTRIES is 500) so the first is evicted.
    for (let i = 0; i <= 500; i++) await cached(`k${i}`, async () => i);
    const fn = vi.fn(async () => -1);
    await cached("k0", fn); // evicted → miss → runs fn
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
