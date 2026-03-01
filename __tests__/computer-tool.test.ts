import { describe, expect, it, vi, beforeEach } from "vitest";
import { createE2BComputerTool } from "@/lib/tools/computer-tool";

const mockSandbox = {
  screenshot: vi.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
  leftClick: vi.fn().mockResolvedValue(undefined),
  rightClick: vi.fn().mockResolvedValue(undefined),
  doubleClick: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
  press: vi.fn().mockResolvedValue(undefined),
  scroll: vi.fn().mockResolvedValue(undefined),
  moveMouse: vi.fn().mockResolvedValue(undefined),
  drag: vi.fn().mockResolvedValue(undefined),
};

const mockScaler = {
  takeScreenshot: vi.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
  scaleToOriginalSpace: vi.fn((coords: [number, number]) => [coords[0] * 2, coords[1] * 2] as [number, number]),
  getScaledResolution: vi.fn(() => [1920, 1080] as [number, number]),
};

describe("createE2BComputerTool", () => {
  const tool = createE2BComputerTool({ desktop: mockSandbox as never, resolutionScaler: mockScaler as never }, [1920, 1080]);

  beforeEach(() => vi.clearAllMocks());

  it("takes screenshot and returns base64 image data", async () => {
    const result = await tool.execute({ action: "screenshot" }, {} as never);
    expect(mockScaler.takeScreenshot).toHaveBeenCalled();
    expect(result.type).toBe("screenshot");
  });

  it("calls leftClick with scaled coordinates", async () => {
    await tool.execute({ action: "left_click", x: 100, y: 200 }, {} as never);
    expect(mockSandbox.leftClick).toHaveBeenCalledWith(200, 400);
  });

  it("calls write with chunk-based typing settings", async () => {
    await tool.execute({ action: "type", text: "hello world" }, {} as never);
    expect(mockSandbox.write).toHaveBeenCalledWith("hello world", expect.objectContaining({ chunkSize: 50 }));
  });
});
