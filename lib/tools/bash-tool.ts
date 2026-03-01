import { tool } from "ai";
import { Sandbox } from "@e2b/desktop";
import { z } from "zod";

const bashToolInputSchema = z.object({
  command: z.string(),
  timeout: z.number().optional().default(30_000),
});

type BashToolInput = z.infer<typeof bashToolInputSchema>;

export function createBashTool(sandbox: Sandbox) {
  return tool({
    description: "Run bash commands in the sandbox for faster inspection and automation.",
    inputSchema: bashToolInputSchema,
    execute: async ({ command, timeout }: BashToolInput) => {
      const result = await sandbox.commands.run(command, { timeoutMs: timeout });
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.exitCode,
      };
    },
  });
}
