import { tool } from "ai";
import { Sandbox } from "@e2b/desktop";
import { z } from "zod";
import { ResolutionScaler } from "@/lib/streaming/resolution";

export interface ComputerToolContext {
  desktop: Sandbox;
  resolutionScaler: ResolutionScaler;
}

const computerActionSchema = z.object({
  action: z.enum([
    "screenshot",
    "left_click",
    "right_click",
    "double_click",
    "type",
    "press",
    "scroll",
    "move_mouse",
    "drag",
  ]),
  x: z.number().optional(),
  y: z.number().optional(),
  text: z.string().optional(),
  key: z.union([z.string(), z.array(z.string())]).optional(),
  scroll_direction: z.enum(["up", "down"]).optional(),
  scroll_amount: z.number().optional(),
  from_coords: z.tuple([z.number(), z.number()]).optional(),
  to_coords: z.tuple([z.number(), z.number()]).optional(),
});

type ComputerActionInput = z.infer<typeof computerActionSchema>;

type ComputerActionResult =
  | { type: "screenshot"; data: string }
  | { type: "action_done"; action: string; x?: number; y?: number; key?: string | string[] }
  | { type: "action_error"; message: string };

export function createE2BComputerTool(context: ComputerToolContext, resolution: [number, number]) {
  return tool({
    description: `Control a Linux desktop at ${resolution[0]}x${resolution[1]} pixels.`,
    inputSchema: computerActionSchema,
    execute: async (input: ComputerActionInput): Promise<ComputerActionResult> => {
      const { desktop, resolutionScaler } = context;
      const scalePoint = (x: number, y: number): [number, number] => resolutionScaler.scaleToOriginalSpace([x, y]);

      switch (input.action) {
        case "screenshot": {
          const bytes = await resolutionScaler.takeScreenshot();
          return { type: "screenshot", data: Buffer.from(bytes).toString("base64") };
        }
        case "left_click": {
          if (input.x === undefined || input.y === undefined) return { type: "action_error", message: "x and y required" };
          const [scaledX, scaledY] = scalePoint(input.x, input.y);
          await desktop.leftClick(scaledX, scaledY);
          return { type: "action_done", action: "left_click", x: input.x, y: input.y };
        }
        case "right_click": {
          if (input.x === undefined || input.y === undefined) return { type: "action_error", message: "x and y required" };
          const [scaledX, scaledY] = scalePoint(input.x, input.y);
          await desktop.rightClick(scaledX, scaledY);
          return { type: "action_done", action: "right_click", x: input.x, y: input.y };
        }
        case "double_click": {
          if (input.x === undefined || input.y === undefined) return { type: "action_error", message: "x and y required" };
          const [scaledX, scaledY] = scalePoint(input.x, input.y);
          await desktop.doubleClick(scaledX, scaledY);
          return { type: "action_done", action: "double_click", x: input.x, y: input.y };
        }
        case "type": {
          if (!input.text) return { type: "action_error", message: "text required" };
          await desktop.write(input.text, { chunkSize: 50, delayInMs: 30 });
          return { type: "action_done", action: "type" };
        }
        case "press": {
          if (!input.key) return { type: "action_error", message: "key required" };
          await desktop.press(input.key);
          return { type: "action_done", action: "press", key: input.key };
        }
        case "scroll": {
          await desktop.scroll(input.scroll_direction ?? "down", input.scroll_amount ?? 3);
          return { type: "action_done", action: "scroll" };
        }
        case "move_mouse": {
          if (input.x === undefined || input.y === undefined) return { type: "action_error", message: "x and y required" };
          const [scaledX, scaledY] = scalePoint(input.x, input.y);
          await desktop.moveMouse(scaledX, scaledY);
          return { type: "action_done", action: "move_mouse", x: input.x, y: input.y };
        }
        case "drag": {
          if (!input.from_coords || !input.to_coords) return { type: "action_error", message: "from_coords and to_coords required" };
          const fromScaled = scalePoint(input.from_coords[0], input.from_coords[1]);
          const toScaled = scalePoint(input.to_coords[0], input.to_coords[1]);
          await desktop.drag(fromScaled, toScaled);
          return { type: "action_done", action: "drag" };
        }
      }
    },

  });
}

export function createComputerTool(context: ComputerToolContext) {
  return createE2BComputerTool(context, context.resolutionScaler.getScaledResolution());
}

export const COMPUTER_USE_INSTRUCTIONS = `
You are Surf, a helpful desktop agent. Use tools to control the desktop safely and effectively.
Always reason briefly, take screenshots when uncertain, and continue until the user task is complete.
`;
