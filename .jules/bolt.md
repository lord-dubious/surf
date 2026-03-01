## 2026-02-26 — Vision models need image content parts in EVERY turn

**Learning:** Vision models receive screenshots via `{ type: "image", image: Buffer }` content
parts in the user message array. If you pass `content: "string"` for any turn after the first,
the model loses all visual context.

**Action:** Always build messages as `{ role: "user", content: [{ type: "image", ... }, { type: "text", ... }] }`.
Use `prepareStep` in `ToolLoopAgent` as the canonical injection point.

## 2026-02-26 — Use @ai-sdk/openai-compatible for all third-party endpoints

**Learning:** `@ai-sdk/openai` includes OpenAI-specific assumptions. `@ai-sdk/openai-compatible`
is the correct package for third-party OpenAI-format APIs.

**Action:** Custom provider type -> always `createOpenAICompatible`. OpenRouter -> always
`@openrouter/ai-sdk-provider`.

## 2026-02-26 — OpenRouter requires its own package

**Learning:** OpenRouter relies on `HTTP-Referer` and `X-Title` headers for attribution/routing.

**Action:** Always use `@openrouter/ai-sdk-provider`. Detect `openrouter.ai` custom URLs and route
through the OpenRouter provider.
