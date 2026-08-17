import { describe, expect, it } from "vitest";
import { ProcessCommandRunner } from "./command-runner.js";

describe("ProcessCommandRunner", () => {
  it("returns collected output when an intentional tail window expires", async () => {
    const started = Date.now();
    const result = await new ProcessCommandRunner().run(
      process.execPath,
      ["-e", "console.log('runtime-event');setInterval(()=>{},1000)"],
      { cwd: process.cwd(), timeoutMs: 500, acceptTimeout: true },
    );
    expect(result.stdout).toContain("runtime-event");
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
