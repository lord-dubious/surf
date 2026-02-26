/**
 * Unified computer tool definition for AI SDK
 * 
 * This tool works across all providers using the AI SDK's tool() function.
 * It provides a standardized interface for vision models to control the desktop.
 */
import { tool } from "ai";
import { z } from "zod";
import { Sandbox } from "@e2b/desktop";
import { ResolutionScaler } from "@/lib/streaming/resolution";

/**
 * Computer action types supported by the tool
 */
export const ComputerActionSchema = z.enum([
  "click",
  "double_click",
  "type",
  "keypress",
  "scroll",
  "move",
  "drag",
  "wait",
  "screenshot",
]);

/**
 * Zod schema for computer tool parameters
 */
export const ComputerToolParameters = z.object({
  action: ComputerActionSchema.describe("The type of action to perform"),
  
  // Coordinates
  x: z.number().optional().describe("X coordinate (0 = left edge)"),
  y: z.number().optional().describe("Y coordinate (0 = top edge)"),
  
  // Text input
  text: z.string().optional().describe("Text to type"),
  
  // Key input
  keys: z.array(z.string()).optional().describe("Keys to press (e.g., ['Enter'], ['Ctrl', 'C'])"),
  
  // Mouse button
  button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button to click"),
  
  // Scroll
  scroll_direction: z.enum(["up", "down"]).optional().describe("Scroll direction"),
  scroll_amount: z.number().optional().describe("Number of scroll steps"),
  
  // Drag path
  path: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
    })
  ).optional().describe("Path of coordinates for drag operations (start and end points)"),
  
  // Wait duration
  duration: z.number().optional().describe("Duration to wait in seconds"),
});

export type ComputerToolParams = z.infer<typeof ComputerToolParameters>;

/**
 * Context passed to the tool executor
 */
export interface ComputerToolContext {
  desktop: Sandbox;
  resolutionScaler: ResolutionScaler;
}

/**
 * Execute a computer action on the E2B desktop
 */
export async function executeComputerAction(
  params: ComputerToolParams,
  context: ComputerToolContext
): Promise<{ success: boolean; screenshot?: string; error?: string }> {
  const { desktop, resolutionScaler } = context;

  try {
    switch (params.action) {
      case "click": {
        if (params.x === undefined || params.y === undefined) {
          return { success: false, error: "Missing coordinates for click" };
        }
        const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([
          params.x,
          params.y,
        ]);
        const button = params.button || "left";
        
        if (button === "left") {
          await desktop.leftClick(scaledX, scaledY);
        } else if (button === "right") {
          await desktop.rightClick(scaledX, scaledY);
        } else if (button === "middle") {
          await desktop.middleClick(scaledX, scaledY);
        }
        break;
      }

      case "double_click": {
        if (params.x === undefined || params.y === undefined) {
          return { success: false, error: "Missing coordinates for double_click" };
        }
        const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([
          params.x,
          params.y,
        ]);
        await desktop.doubleClick(scaledX, scaledY);
        break;
      }

      case "type": {
        if (!params.text) {
          return { success: false, error: "Missing text for type action" };
        }
        await desktop.write(params.text);
        break;
      }

      case "keypress": {
        if (!params.keys || params.keys.length === 0) {
          return { success: false, error: "Missing keys for keypress action" };
        }
        await desktop.press(params.keys);
        break;
      }

      case "scroll": {
        if (params.x === undefined || params.y === undefined) {
          return { success: false, error: "Missing coordinates for scroll" };
        }
        const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([
          params.x,
          params.y,
        ]);
        await desktop.moveMouse(scaledX, scaledY);
        
        const direction = params.scroll_direction || "down";
        const amount = params.scroll_amount || 1;
        await desktop.scroll(direction, amount);
        break;
      }

      case "move": {
        if (params.x === undefined || params.y === undefined) {
          return { success: false, error: "Missing coordinates for move" };
        }
        const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([
          params.x,
          params.y,
        ]);
        await desktop.moveMouse(scaledX, scaledY);
        break;
      }

      case "drag": {
        if (!params.path || params.path.length < 2) {
          return { success: false, error: "Drag requires at least 2 path points" };
        }
        const start = resolutionScaler.scaleToOriginalSpace([
          params.path[0].x,
          params.path[0].y,
        ]);
        const end = resolutionScaler.scaleToOriginalSpace([
          params.path[params.path.length - 1].x,
          params.path[params.path.length - 1].y,
        ]);
        await desktop.drag(start, end);
        break;
      }

      case "wait": {
        const duration = (params.duration || 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, duration));
        break;
      }

      case "screenshot": {
        // Screenshot is handled automatically after each action
        break;
      }

      default: {
        return { success: false, error: `Unknown action: ${params.action}` };
      }
    }

    // Take screenshot after action
    const screenshotData = await resolutionScaler.takeScreenshot();
    const screenshotBase64 = Buffer.from(screenshotData).toString("base64");

    return {
      success: true,
      screenshot: `data:image/png;base64,${screenshotBase64}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Action execution failed",
    };
  }
}

/**
 * Create the computer tool for AI SDK v6
 * 
 * This tool can be used with any AI SDK provider that supports tool calling.
 * Returns screenshots as image content that models can understand.
 */
export function createComputerTool(context: ComputerToolContext) {
  return tool({
    description: `Control the computer desktop. Available actions:
- click: Click at coordinates (x, y). Optional: button ('left', 'right', 'middle')
- double_click: Double-click at coordinates
- type: Type text string
- keypress: Press keys (e.g., ['Enter'], ['Ctrl', 'C'])
- scroll: Scroll at coordinates. Requires scroll_direction ('up'/'down'), optional scroll_amount
- move: Move mouse to coordinates
- drag: Drag from start to end. Requires path array with at least 2 points
- wait: Wait for duration seconds
- screenshot: Request a screenshot (handled automatically after each action)

Coordinates are in the model's resolution space (0,0 is top-left).`,
    inputSchema: ComputerToolParameters,
    execute: async (params) => {
      const result = await executeComputerAction(params, context);
      
      // Return structured result for toModelOutput to process
      return {
        success: result.success,
        screenshot: result.screenshot,
        error: result.error,
      };
    },
    // AI SDK v6: Convert tool output to model-readable format
    toModelOutput({ output }: { output: { success: boolean; screenshot?: string; error?: string } }) {
      if (output.error) {
        return {
          type: 'content' as const,
          value: [{ type: 'text' as const, text: `Error: ${output.error}` }],
        };
      }
      
      if (output.screenshot) {
        // Extract base64 data from data URL
        const base64Data = output.screenshot.replace(/^data:image\/png;base64,/, "");
        return {
          type: 'content' as const,
          value: [{ type: 'image-data' as const, data: base64Data, mediaType: 'image/png' }],
        };
      }
      
      return {
        type: 'content' as const,
        value: [{ type: 'text' as const, text: output.success ? "Action completed successfully" : "Action failed" }],
      };
    },
  });
}

/**
 * Computer tool type for use with streamText
 */
export type ComputerTool = ReturnType<typeof createComputerTool>;

/**
 * System instructions for computer use
 */
export const COMPUTER_USE_INSTRUCTIONS = `
You are Surf, a helpful assistant that can use a computer to help the user with their tasks.
You can use the computer to search the web, write code, and more.

Surf is built by E2B, which provides an open source isolated virtual computer in the cloud made for AI use cases.
This application integrates E2B's desktop sandbox with AI models to create an agent that can perform tasks
on a virtual computer through natural language instructions.

The screenshots you receive are from a running sandbox instance, allowing you to see and interact with a real
virtual computer environment in real-time.

Since you are operating in a secure, isolated sandbox micro VM, you can execute most commands and operations without
worrying about security concerns. This environment is specifically designed for AI experimentation and task execution.

The sandbox is based on Ubuntu 22.04 and comes with many pre-installed applications including:
- Firefox browser
- Visual Studio Code
- LibreOffice suite
- Python 3 with common libraries
- Terminal with standard Linux utilities
- File manager (PCManFM)
- Text editor (Gedit)
- Calculator and other basic utilities

IMPORTANT RULES:
1. It is okay to run terminal commands at any point without confirmation, as long as they are required to fulfill the task.
2. When typing commands in the terminal, ALWAYS send a keypress Enter action immediately after typing the command to execute it.
3. Terminal commands will not run until you press Enter.
4. When editing files, prefer to use Visual Studio Code (VS Code) as it provides a better editing experience.
5. After each action, you will automatically receive a screenshot showing the result.
6. You do NOT need to request screenshots separately - they are provided automatically after each action.
7. When the user explicitly asks you to press any key (Enter, Tab, Ctrl+C, etc.), you MUST do so immediately.

Remember: Coordinates are in the format (x, y) where x=0 is the left edge and y=0 is the top edge.
`;
