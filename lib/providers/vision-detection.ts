const VISION_MODEL_PATTERNS: RegExp[] = [
  /gemini/i,
  /(^|[-_./:])vision($|[-_./:])/i,
  /kimi-k2\.5/i,
  /kimi-vl/i,
  /qwen.*vl/i,
  /pixtral/i,
  /claude/i,
  /gpt-4o/i,
  /gpt-4-vision/i,
  /llava/i,
  /llama-3\.2-.*vision/i,
  /llama-4-.*(scout|maverick)/i,
  /minicpm.*v/i,
  /idefics/i,
  /bakllava/i,
];

export function hasVisionCapability(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.some((pattern) => pattern.test(modelId));
}
