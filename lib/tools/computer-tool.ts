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
  | { type: "action_error"; action: string; message: string; error?: string };

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPointWithinBounds(point: [number, number], bounds: [number, number]): boolean {
  const [x, y] = point;
  return x >= 0 && y >= 0 && x < bounds[0] && y < bounds[1];
}

export function createE2BComputerTool(context: ComputerToolContext, resolution: [number, number]) {
  return tool({
    description: `Control a Linux desktop at ${resolution[0]}x${resolution[1]} pixels.`,
    inputSchema: computerActionSchema,
    execute: async (input: ComputerActionInput): Promise<ComputerActionResult> => {
      const { desktop, resolutionScaler } = context;
      const modelBounds = resolutionScaler.getScaledResolution();
      const scalePoint = (x: number, y: number): [number, number] => resolutionScaler.scaleToOriginalSpace([x, y]);

      const validateXY = (x: number | undefined, y: number | undefined): { ok: true; point: [number, number] } | { ok: false; error: ComputerActionResult } => {
        if (!isFiniteCoordinate(x) || !isFiniteCoordinate(y)) {
          return { ok: false, error: { type: "action_error", action: input.action, message: "coordinates must be finite numbers" } };
        }

        const point: [number, number] = [x, y];
        if (!isPointWithinBounds(point, modelBounds)) {
          return { ok: false, error: { type: "action_error", action: input.action, message: "coordinates out of bounds" } };
        }

        return { ok: true, point };
      };

      try {
        switch (input.action) {
          case "screenshot": {
            const bytes = await resolutionScaler.takeScreenshot();
            return { type: "screenshot", data: Buffer.from(bytes).toString("base64") };
          }
          case "left_click": {
            const validation = validateXY(input.x, input.y);
            if (!validation.ok) return validation.error;
            const [scaledX, scaledY] = scalePoint(validation.point[0], validation.point[1]);
            await desktop.leftClick(scaledX, scaledY);
            return { type: "action_done", action: "left_click", x: validation.point[0], y: validation.point[1] };
          }
          case "right_click": {
            const validation = validateXY(input.x, input.y);
            if (!validation.ok) return validation.error;
            const [scaledX, scaledY] = scalePoint(validation.point[0], validation.point[1]);
            await desktop.rightClick(scaledX, scaledY);
            return { type: "action_done", action: "right_click", x: validation.point[0], y: validation.point[1] };
          }
          case "double_click": {
            const validation = validateXY(input.x, input.y);
            if (!validation.ok) return validation.error;
            const [scaledX, scaledY] = scalePoint(validation.point[0], validation.point[1]);
            await desktop.doubleClick(scaledX, scaledY);
            return { type: "action_done", action: "double_click", x: validation.point[0], y: validation.point[1] };
          }
          case "type": {
            if (!input.text) return { type: "action_error", action: "type", message: "text required" };
            await desktop.write(input.text, { chunkSize: 50, delayInMs: 30 });
            return { type: "action_done", action: "type" };
          }
          case "press": {
            if (!input.key) return { type: "action_error", action: "press", message: "key required" };
            await desktop.press(input.key);
            return { type: "action_done", action: "press", key: input.key };
          }
          case "scroll": {
            await desktop.scroll(input.scroll_direction ?? "down", input.scroll_amount ?? 3);
            return { type: "action_done", action: "scroll" };
          }
          case "move_mouse": {
            const validation = validateXY(input.x, input.y);
            if (!validation.ok) return validation.error;
            const [scaledX, scaledY] = scalePoint(validation.point[0], validation.point[1]);
            await desktop.moveMouse(scaledX, scaledY);
            return { type: "action_done", action: "move_mouse", x: validation.point[0], y: validation.point[1] };
          }
          case "drag": {
            if (!input.from_coords || !input.to_coords) {
              return { type: "action_error", action: "drag", message: "from_coords and to_coords required" };
            }

            if (!isPointWithinBounds(input.from_coords, modelBounds) || !isPointWithinBounds(input.to_coords, modelBounds)) {
              return { type: "action_error", action: "drag", message: "coordinates out of bounds" };
            }

            const fromScaled = scalePoint(input.from_coords[0], input.from_coords[1]);
            const toScaled = scalePoint(input.to_coords[0], input.to_coords[1]);
            await desktop.drag(fromScaled, toScaled);
            return { type: "action_done", action: "drag" };
          }
          default: {
            return { type: "action_error", action: (input as any).action, message: `unknown action ${(input as any).action}` };
          }
        }
      } catch (error) {
        return {
          type: "action_error",
          action: input.action,
          message: `failed to ${input.action}`,
          error: error instanceof Error ? error.message : String(error),
        };
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
