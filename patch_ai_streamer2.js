const fs = require('fs');
let content = fs.readFileSync('lib/streaming/ai-sdk-streamer.ts', 'utf8');

const search = `    if (chunk.type === "tool-result") {
      const toolResult = chunk as { output?: { type?: string; payload?: unknown; error?: unknown } };
      const output = toolResult.output;
      if (output?.type === "action_error" || output?.type === "error-text") {
        yield { type: SSEEventType.ERROR, content: String(output.error || output.payload || "Tool action failed") };
      } else {
        yield { type: SSEEventType.ACTION_COMPLETED };
      }
      return;
    }`;

const replace = `    if (chunk.type === "tool-result") {
      const toolResult = chunk as { output?: { type?: string; payload?: unknown; error?: unknown; message?: string } };
      const output = toolResult.output;
      if (output?.type === "action_error" || output?.type === "error-text") {
        const payloadMessage = typeof output.payload === 'object' && output.payload !== null && 'message' in output.payload ? (output.payload as any).message : undefined;
        const content = output.message || payloadMessage || output.error || output.payload || "Tool action failed";
        yield { type: SSEEventType.ERROR, content: String(content) };
      } else {
        yield { type: SSEEventType.ACTION_COMPLETED };
      }
      return;
    }`;

content = content.replace(search, replace);
fs.writeFileSync('lib/streaming/ai-sdk-streamer.ts', content);
console.log('patched');
