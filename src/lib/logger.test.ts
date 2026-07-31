import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_DIR } from "@/db/client";
import { logger } from "./logger";

// A smoke test, not a behavioral one: constructing DailyRotateFile creates its
// target directory immediately (verified manually — importing this module
// alone puts `logs/` on disk), so there's little value re-proving winston's
// own file-writing here. What's actually worth catching is a wiring mistake —
// wrong directory, wrong rotation unit, wrong retention — that a broken
// vitest.config.ts DATA_DIR override wouldn't otherwise surface.
describe("logger", () => {
  it("writes under DATA_DIR/logs, one file per calendar day, 7 days kept", () => {
    // The constructor options, not the top-level instance — most of these
    // properties (datePattern, maxFiles) only ended up on `.options`, found by
    // inspecting the real object rather than guessing at winston's shape.
    const { options } = logger.transports[0] as unknown as {
      options: { dirname: string; datePattern: string; maxFiles: string };
    };
    expect(options.dirname).toBe(path.join(DATA_DIR, "logs"));
    expect(options.datePattern).toBe("YYYY-MM-DD");
    expect(options.maxFiles).toBe("7d");
  });
});
