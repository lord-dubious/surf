"use server";

import { 
  SANDBOX_TIMEOUT_MS, 
  DEFAULT_SANDBOX_TIMEOUT_MS,
  MAX_SANDBOX_TIMEOUT_MS,
  MIN_SANDBOX_TIMEOUT_MS 
} from "@/lib/config";
import { Sandbox } from "@e2b/desktop";

export async function increaseTimeout(
  sandboxId: string, 
  durationMs?: number
): Promise<{ success: boolean; timeoutMs?: number; error?: string }> {
  try {
    const desktop = await Sandbox.connect(sandboxId);
    
    // Use provided duration or default, clamped to min/max bounds
    const timeoutMs = Math.max(
      MIN_SANDBOX_TIMEOUT_MS,
      Math.min(
        MAX_SANDBOX_TIMEOUT_MS,
        durationMs ?? DEFAULT_SANDBOX_TIMEOUT_MS
      )
    );
    
    await desktop.setTimeout(timeoutMs);
    return { success: true, timeoutMs };
  } catch (error) {
    console.error("Failed to increase timeout:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to set timeout" 
    };
  }
}

export async function stopSandboxAction(sandboxId: string) {
  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.kill();
    return true;
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return false;
  }
}
