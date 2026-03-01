import { describe, expect, it, vi } from "vitest";
import { createBashTool } from "@/lib/tools/bash-tool";

describe("createBashTool", () => {
  const mockSandbox = {
    commands: {
      run: vi.fn().mockResolvedValue({ stdout: "hello", stderr: "", exitCode: 0 }),
    },
  };

  const tool = createBashTool(mockSandbox as never);

  it("executes command and returns stdout", async () => {
    const result = await tool.execute({ command: "echo hello" }, {} as never);
    expect(mockSandbox.commands.run).toHaveBeenCalledWith("echo hello", { timeoutMs: undefined });
    expect(result.stdout).toBe("hello");
  });
});
