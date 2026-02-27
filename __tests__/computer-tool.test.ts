import { describe, expect, it, vi } from 'vitest';
import { executeComputerAction } from '@/lib/tools/computer-tool';

const makeContext = () => {
  const desktop = {
    leftClick: vi.fn(),
    rightClick: vi.fn(),
    middleClick: vi.fn(),
    doubleClick: vi.fn(),
    write: vi.fn(),
    press: vi.fn(),
    moveMouse: vi.fn(),
    scroll: vi.fn(),
    drag: vi.fn(),
  };

  const resolutionScaler = {
    scaleToOriginalSpace: vi.fn(([x, y]: [number, number]) => [x * 2, y * 2]),
    takeScreenshot: vi.fn(async () => Buffer.from('screen-binary')),
  };

  return { desktop, resolutionScaler } as any;
};

describe('executeComputerAction', () => {
  it('fails gracefully when click coordinates are missing', async () => {
    const context = makeContext();

    const result = await executeComputerAction({ action: 'click' }, context);

    expect(result).toEqual({ success: false, error: 'Missing coordinates for click' });
    expect(context.desktop.leftClick).not.toHaveBeenCalled();
  });

  it('executes click using scaled coordinates and returns screenshot', async () => {
    const context = makeContext();

    const result = await executeComputerAction({ action: 'click', x: 5, y: 10, button: 'left' }, context);

    expect(context.resolutionScaler.scaleToOriginalSpace).toHaveBeenCalledWith([5, 10]);
    expect(context.desktop.leftClick).toHaveBeenCalledWith(10, 20);
    expect(result.success).toBe(true);
    expect(result.screenshot).toMatch(/^data:image\/png;base64,/);
  });

  it('requires at least two points for drag actions', async () => {
    const context = makeContext();

    const result = await executeComputerAction({ action: 'drag', path: [{ x: 1, y: 2 }] }, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Drag requires at least 2 path points');
  });
});
