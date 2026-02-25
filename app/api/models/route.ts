import { NextRequest, NextResponse } from "next/server";
import { ModelInfo } from "@/types/api";

/**
 * API route to fetch available models from an OpenAI-compatible endpoint.
 * Proxies the request to avoid CORS issues when calling third-party APIs from the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const { baseUrl, apiKey } = await request.json();

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Base URL and API Key are required" },
        { status: 400 }
      );
    }

    // Normalize the base URL - ensure it doesn't end with a slash
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const modelsUrl = `${normalizedBaseUrl}/models`;

    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `Failed to fetch models: ${response.status} ${response.statusText}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Handle both { data: [...] } and direct array formats
    const models: ModelInfo[] = Array.isArray(data)
      ? data
      : Array.isArray(data.data)
        ? data.data
        : [];

    // Sort models alphabetically by ID
    models.sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch models from the provider",
      },
      { status: 500 }
    );
  }
}
