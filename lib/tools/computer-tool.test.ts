import { describe, expect, it, vi } from "vitest";
import { createComputerTool } from "./computer-tool";

function createMockContext() {
  return {
    desktop: {
      leftClick: vi.fn().mockResolvedValue(undefined),
      rightClick: vi.fn().mockResolvedValue(undefined),
      doubleClick: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      scroll: vi.fn().mockResolvedValue(undefined),
      moveMouse: vi.fn().mockResolvedValue(undefined),
      drag: vi.fn().mockResolvedValue(undefined),
    },
    resolutionScaler: {
      getScaledResolution: vi.fn(() => [1000, 800] as [number, number]),
      scaleToOriginalSpace: vi.fn(([x, y]: [number, number]) => [x, y] as [number, number]),
      takeScreenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
    },
  };
}

describe("createComputerTool legacy wrapper", () => {
  it("executes a happy-path click action", async () => {
    const context = createMockContext();
    const legacyTool = createComputerTool(context as never);

    const result = await legacyTool.execute({ action: "left_click", x: 10, y: 20 }, {} as never);

    expect(context.desktop.leftClick).toHaveBeenCalledWith(10, 20);
    expect(result).toEqual(expect.objectContaining({ type: "action_done", action: "left_click" }));
  });

  it("returns structured error for out-of-bounds coordinates", async () => {
    const context = createMockContext();
    const legacyTool = createComputerTool(context as never);

    const result = await legacyTool.execute({ action: "move_mouse", x: 5000, y: 20 }, {} as never);

    expect(context.desktop.moveMouse).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ type: "action_error", action: "move_mouse", message: "coordinates out of bounds" }),
    );
  });
});
