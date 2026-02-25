import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent, OpenAICompatibleConfig } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { ResolutionScaler } from "./resolution";

const INSTRUCTIONS = `
You are Surf, a helpful assistant that can use a computer to help the user with their tasks.
You can use the computer to search the web, write code, and more.

Surf is built by E2B, which provides an open source isolated virtual computer in the cloud made for AI use cases.
This application integrates E2B's desktop sandbox with an AI model API to create an AI agent that can perform tasks
on a virtual computer through natural language instructions.

The screenshots that you receive are from a running sandbox instance, allowing you to see and interact with a real
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

IMPORTANT: It is okay to run terminal commands at any point without confirmation, as long as they are required to fulfill the task the user has given. You should execute commands immediately when needed to complete the user's request efficiently.

IMPORTANT: When typing commands in the terminal, ALWAYS send a KEYPRESS ENTER action immediately after typing the command to execute it. Terminal commands will not run until you press Enter.

IMPORTANT: When editing files, prefer to use Visual Studio Code (VS Code) as it provides a better editing experience with syntax highlighting, code completion, and other helpful features.

## Computer Use Instructions
You have access to a computer tool that allows you to interact with a virtual desktop.
You can take screenshots to see the current state of the screen, and perform actions like clicking, typing, scrolling, etc.

When you need to interact with the computer:
1. First take a screenshot to see the current state
2. Analyze what you see and determine the next action
3. Perform the action (click, type, scroll, etc.)
4. Take another screenshot to verify the result

Available actions:
- screenshot: Take a screenshot of the current screen
- click: Click at coordinates (x, y) with left/right/middle button
- double_click: Double-click at coordinates (x, y)
- type: Type text
- keypress: Press key(s)
- scroll: Scroll up/down at coordinates
- move: Move mouse to coordinates (x, y)
- drag: Drag from one point to another
- wait: Wait for a moment
`;

/**
 * OpenAI-Compatible streamer for open-source models that support
 * OpenAI-compatible APIs (e.g., Kimi K2.5, MiniMax M2, GLM 4.6V).
 *
 * This streamer uses the OpenAI SDK with a custom baseURL to connect
 * to any OpenAI-compatible provider. It uses the chat completions API
 * with vision support for computer use, since most open-source providers
 * don't support the Responses API / computer_use_preview tool.
 */
export class OpenAICompatibleComputerStreamer
  implements ComputerInteractionStreamerFacade
{
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;

  private client: OpenAI;
  private modelId: string;

  constructor(
    desktop: Sandbox,
    resolutionScaler: ResolutionScaler,
    config: OpenAICompatibleConfig
  ) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.modelId = config.modelId;
    this.instructions = INSTRUCTIONS;
  }

  async executeAction(
    action: Record<string, unknown>
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;
    const actionType = action.type as string;

    switch (actionType) {
      case "screenshot": {
        break;
      }
      case "double_click": {
        const x = action.x as number;
        const y = action.y as number;
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([x, y]);
        await desktop.doubleClick(coordinate[0], coordinate[1]);
        break;
      }
      case "click": {
        const x = action.x as number;
        const y = action.y as number;
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([x, y]);
        const button = (action.button as string) || "left";

        if (button === "left") {
          await desktop.leftClick(coordinate[0], coordinate[1]);
        } else if (button === "right") {
          await desktop.rightClick(coordinate[0], coordinate[1]);
        } else if (button === "middle" || button === "wheel") {
          await desktop.middleClick(coordinate[0], coordinate[1]);
        }
        break;
      }
      case "type": {
        await desktop.write(action.text as string);
        break;
      }
      case "keypress": {
        const keys = (action.keys as string[]) || [action.key as string];
        await desktop.press(keys.join("+"));
        break;
      }
      case "move": {
        const x = action.x as number;
        const y = action.y as number;
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([x, y]);
        await desktop.moveMouse(coordinate[0], coordinate[1]);
        break;
      }
      case "scroll": {
        const scrollX = (action.x as number) || 0;
        const scrollY = (action.y as number) || 0;
        const scrollCoord = this.resolutionScaler.scaleToOriginalSpace([
          scrollX,
          scrollY,
        ]);
        const scrollAmount = (action.scroll_y as number) || (action.amount as number) || 3;
        const direction = (action.direction as string) || (scrollAmount < 0 ? "up" : "down");

        await desktop.moveMouse(scrollCoord[0], scrollCoord[1]);
        await desktop.scroll(
          direction === "up" ? "up" : "down",
          Math.abs(scrollAmount)
        );
        break;
      }
      case "wait": {
        const duration = (action.duration as number) || 1;
        await new Promise((resolve) => setTimeout(resolve, duration * 1000));
        break;
      }
      case "drag": {
        const startX = (action.start_x as number) || 0;
        const startY = (action.start_y as number) || 0;
        const endX = (action.end_x as number) || 0;
        const endY = (action.end_y as number) || 0;

        const startCoord = this.resolutionScaler.scaleToOriginalSpace([
          startX,
          startY,
        ]);
        const endCoord = this.resolutionScaler.scaleToOriginalSpace([
          endX,
          endY,
        ]);
        await desktop.drag(startCoord, endCoord);
        break;
      }
      default: {
        logWarning("Unknown action type:", actionType, action);
      }
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"openai-compatible">> {
    const { messages, signal } = props;

    try {
      const modelResolution = this.resolutionScaler.getScaledResolution();

      // Take initial screenshot
      const initialScreenshot = await this.resolutionScaler.takeScreenshot();
      const initialScreenshotBase64 =
        Buffer.from(initialScreenshot).toString("base64");

      // Build conversation with system message and screenshot
      const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: this.instructions,
        },
      ];

      // Add previous messages
      for (const msg of messages) {
        if (msg.role === "user") {
          chatMessages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          chatMessages.push({ role: "assistant", content: msg.content });
        }
      }

      // Replace the last user message with one that includes the screenshot
      const lastUserIdx = chatMessages.length - 1;
      const lastUserMsg = chatMessages[lastUserIdx];
      if (lastUserMsg && lastUserMsg.role === "user") {
        const textContent =
          typeof lastUserMsg.content === "string" ? lastUserMsg.content : "";
        chatMessages[lastUserIdx] = {
          role: "user",
          content: [
            { type: "text", text: textContent },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${initialScreenshotBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `\n\nCurrent screen resolution: ${modelResolution[0]}x${modelResolution[1]}. The screenshot above shows the current state of the desktop. Please analyze it and help with the task. Respond with a JSON object describing the action to take, using this format: {"reasoning": "your reasoning", "action": {"type": "click|type|keypress|scroll|double_click|move|drag|wait|screenshot", ...params}}. For click: include "x", "y", "button" (left/right). For type: include "text". For keypress: include "keys" (array). For scroll: include "x", "y", "direction" (up/down), "amount". For move: include "x", "y". If the task is complete, respond with: {"reasoning": "explanation", "action": {"type": "done"}}`,
            },
          ],
        };
      }

      let iteration = 0;
      const maxIterations = 50;

      while (iteration < maxIterations) {
        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        iteration++;

        let response;
        try {
          response = await this.client.chat.completions.create({
            model: this.modelId,
            messages: chatMessages,
            max_tokens: 4096,
            temperature: 0.1,
          });
        } catch (apiError) {
          logError("OpenAI-Compatible API error:", apiError);
          yield {
            type: SSEEventType.ERROR,
            content: `API error from ${this.modelId}: ${apiError instanceof Error ? apiError.message : "Unknown error"}`,
          };
          yield { type: SSEEventType.DONE };
          return;
        }

        const assistantContent =
          response.choices[0]?.message?.content || "";

        logDebug("OpenAI-Compatible response:", assistantContent);

        // Try to parse the response as a JSON action
        let parsed: {
          reasoning?: string;
          action?: Record<string, unknown>;
        } | null = null;

        try {
          // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
          const jsonMatch = assistantContent.match(
            /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
          );
          const jsonStr = jsonMatch ? jsonMatch[1] : assistantContent;
          parsed = JSON.parse(jsonStr.trim());
        } catch {
          // If we can't parse JSON, treat the whole response as reasoning
          yield {
            type: SSEEventType.REASONING,
            content: assistantContent,
          };

          // Ask the model to provide a structured action
          chatMessages.push({
            role: "assistant",
            content: assistantContent,
          });
          chatMessages.push({
            role: "user",
            content:
              'Please respond with a JSON object describing the next action to take. Use the format: {"reasoning": "your reasoning", "action": {"type": "click|type|keypress|scroll|double_click|move|drag|wait|screenshot|done", ...params}}',
          });
          continue;
        }

        if (parsed?.reasoning) {
          yield {
            type: SSEEventType.REASONING,
            content: parsed.reasoning,
          };
        }

        const action = parsed?.action;

        if (!action || action.type === "done") {
          yield {
            type: SSEEventType.REASONING,
            content:
              parsed?.reasoning || assistantContent || "Task completed",
          };
          yield { type: SSEEventType.DONE };
          break;
        }

        // Yield the action event - use the parsed action object directly
        // For openai-compatible models, actions are generic JSON objects
        yield {
          type: SSEEventType.ACTION,
          action: action,
        } as SSEEvent<"openai-compatible">;

        // Execute the action
        await this.executeAction(action);

        yield {
          type: SSEEventType.ACTION_COMPLETED,
        };

        // Take a new screenshot
        const newScreenshot = await this.resolutionScaler.takeScreenshot();
        const newScreenshotBase64 =
          Buffer.from(newScreenshot).toString("base64");

        // Add assistant message and new screenshot to conversation
        chatMessages.push({
          role: "assistant",
          content: assistantContent,
        });

        chatMessages.push({
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${newScreenshotBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `Screenshot after action. Screen resolution: ${modelResolution[0]}x${modelResolution[1]}. Continue with the task. Respond with a JSON action object. If the task is complete, use {"reasoning": "...", "action": {"type": "done"}}`,
            },
          ],
        });
      }

      if (iteration >= maxIterations) {
        yield {
          type: SSEEventType.REASONING,
          content: "Maximum number of iterations reached.",
        };
        yield { type: SSEEventType.DONE };
      }
    } catch (error) {
      logError("OPENAI_COMPATIBLE_STREAMER", error);
      yield {
        type: SSEEventType.ERROR,
        content: `An error occurred with the AI service (${this.modelId}). Please check your configuration and try again.`,
      };
    }
  }
}
