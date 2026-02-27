import test from "node:test";
import assert from "node:assert/strict";

import { executeComputerAction } from "./computer-tool";

class MockDesktop {
  public calls: Array<{ method: string; args: unknown[] }> = [];

  async leftClick(x: number, y: number) {
    this.calls.push({ method: "leftClick", args: [x, y] });
  }

  async rightClick(x: number, y: number) {
    this.calls.push({ method: "rightClick", args: [x, y] });
  }

  async middleClick(x: number, y: number) {
    this.calls.push({ method: "middleClick", args: [x, y] });
  }

  async doubleClick(x: number, y: number) {
    this.calls.push({ method: "doubleClick", args: [x, y] });
  }

  async moveMouse(x: number, y: number) {
    this.calls.push({ method: "moveMouse", args: [x, y] });
  }

  async drag(start: [number, number], end: [number, number]) {
    this.calls.push({ method: "drag", args: [start, end] });
  }

  async scroll(direction: "up" | "down", amount: number) {
    this.calls.push({ method: "scroll", args: [direction, amount] });
  }

  async write(text: string) {
    this.calls.push({ method: "write", args: [text] });
  }

  async press(keys: string[]) {
    this.calls.push({ method: "press", args: [keys] });
  }
}

class MockResolutionScaler {
  public scaleCalls: Array<[number, number]> = [];

  scaleToOriginalSpace([x, y]: [number, number]): [number, number] {
    this.scaleCalls.push([x, y]);
    return [x * 2, y * 3];
  }

  async takeScreenshot(): Promise<Buffer> {
    return Buffer.from("scaled-screenshot-bytes");
  }
}

test("click action scales model coordinates before left click", async () => {
  const desktop = new MockDesktop();
  const resolutionScaler = new MockResolutionScaler();

  const result = await executeComputerAction(
    {
      action: "click",
      x: 10,
      y: 15,
      button: "left",
    },
    { desktop: desktop as any, resolutionScaler: resolutionScaler as any }
  );

  assert.equal(result.success, true);
  assert.deepEqual(resolutionScaler.scaleCalls, [[10, 15]]);
  assert.deepEqual(desktop.calls[0], {
    method: "leftClick",
    args: [20, 45],
  });
  assert.match(result.screenshot ?? "", /^data:image\/png;base64,/);
});

test("drag action scales both path endpoints before drag", async () => {
  const desktop = new MockDesktop();
  const resolutionScaler = new MockResolutionScaler();

  const result = await executeComputerAction(
    {
      action: "drag",
      path: [
        { x: 4, y: 7 },
        { x: 20, y: 30 },
      ],
    },
    { desktop: desktop as any, resolutionScaler: resolutionScaler as any }
  );

  assert.equal(result.success, true);
  assert.deepEqual(resolutionScaler.scaleCalls, [
    [4, 7],
    [20, 30],
  ]);
  assert.deepEqual(desktop.calls[0], {
    method: "drag",
    args: [
      [8, 21],
      [40, 90],
    ],
  });
  assert.match(result.screenshot ?? "", /^data:image\/png;base64,/);
});
