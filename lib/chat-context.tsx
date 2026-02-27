"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  ChatMessage,
  ChatState,
  ParsedSSEEvent,
  SendMessageOptions,
  ActionChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  SystemChatMessage,
} from "@/types/chat";
import { ComputerModel, SSEEventType } from "@/types/api";
import { logDebug, logError } from "./logger";
import { useProviders, getActiveProvider, getStoredE2BApiKey } from "@/lib/providers/store";
import type { ProviderConfig } from "@/lib/providers/types";

interface ChatContextType extends ChatState {
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  setInput: (input: string) => void;
  input: string;
  handleSubmit: (e: React.FormEvent) => string | undefined;
  onSandboxCreated: (
    callback: (sandboxId: string, vncUrl: string) => void
  ) => void;
  model: ComputerModel;
  setModel: (model: ComputerModel) => void;
  /** Active provider configuration (for extended model support) */
  activeProvider: ProviderConfig | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: React.ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const onSandboxCreatedRef = useRef<
    ((sandboxId: string, vncUrl: string) => void) | undefined
  >(undefined);
  const [model, setModel] = useState<ComputerModel>("openai");
  const [activeProvider, setActiveProvider] = useState<ProviderConfig | null>(null);

  // Load active provider from localStorage on mount
  useEffect(() => {
    const provider = getActiveProvider();
    setActiveProvider(provider);
  }, []);

  const parseSSEEvent = (data: string): ParsedSSEEvent<typeof model> | null => {
    try {
      if (!data || data.trim() === "") {
        return null;
      }

      if (data.startsWith("data: ")) {
        const jsonStr = data.substring(6).trim();

        if (!jsonStr) {
          return null;
        }

        return JSON.parse(jsonStr);
      }

      const match = data.match(/data: ({.*})/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }

      return JSON.parse(data);
    } catch (e) {
      logError(
        "Error parsing SSE event:",
        e,
        "Data:",
        data.substring(0, 200) + (data.length > 200 ? "..." : "")
      );
      return null;
    }
  };

  const sendMessage = async ({
    content,
    sandboxId,
    environment,
    resolution,
  }: SendMessageOptions) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      role: "user",
      content,
      id: Date.now().toString(),
    };

    setMessages((prev: ChatMessage[]) => [...prev, userMessage]);

    abortControllerRef.current = new AbortController();

    try {
      console.log("[CHAT_CONTEXT] Sending message with config:", {
        hasActiveProvider: !!activeProvider,
        providerType: activeProvider?.type,
        providerModel: activeProvider?.model,
        hasApiKey: !!activeProvider?.apiKey,
        model: model,
      });
      
      const apiMessages = messages
        .concat(userMessage)
        .filter((msg: ChatMessage) => msg.role === "user" || msg.role === "assistant")
        .map((msg: ChatMessage) => {
          const typedMsg = msg as UserChatMessage | AssistantChatMessage;
          return {
            role: typedMsg.role,
            content: typedMsg.content,
          };
        });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          sandboxId,
          environment,
          resolution,
          model,
          // Include E2B API key from UI (fallback to env on server)
          e2bApiKey: getStoredE2BApiKey() || undefined,
          // Include provider config if available (for extended model support)
          ...(activeProvider && {
            providerConfig: {
              id: activeProvider.id,
              name: activeProvider.name,
              type: activeProvider.type,
              apiKey: activeProvider.apiKey,
              baseUrl: activeProvider.baseUrl,
              model: activeProvider.model,
              useNativeComputerUse: activeProvider.useNativeComputerUse,
            },
          }),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        // Try to read error details from response
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorBody = await response.text();
          console.error("[CHAT_CONTEXT] Error response body:", errorBody);
          if (errorBody) {
            try {
              const parsed = JSON.parse(errorBody);
              errorDetails = parsed.error || parsed.message || errorBody;
            } catch {
              errorDetails = errorBody.substring(0, 200);
            }
          }
        } catch (e) {
          console.error("[CHAT_CONTEXT] Failed to read error body:", e);
        }
        throw new Error(errorDetails);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is null");

      setMessages((prev: ChatMessage[]) => [
        ...prev,
        {
          role: "system",
          id: `system-message-${Date.now()}`,
          content: "Task started",
        },
      ]);

      const decoder = new TextDecoder();
      let assistantMessage = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const parsedEvent = parseSSEEvent(buffer);
            if (parsedEvent) {
              if (parsedEvent.type === SSEEventType.DONE) {
                setMessages((prev) => {
                  const systemMessage: SystemChatMessage = {
                    role: "system",
                    id: `system-${Date.now()}`,
                    content: "Task completed",
                  };

                  return [...prev, systemMessage];
                });
                setIsLoading(false);
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const events = buffer.split("\n\n");

        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.trim()) continue;

          const parsedEvent = parseSSEEvent(event);
          if (!parsedEvent) continue;

          if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
            logDebug("Parsed event:", parsedEvent);
          }

          switch (parsedEvent.type) {
            case SSEEventType.ACTION:
              if (parsedEvent.action) {
                const actionMessage: ActionChatMessage<typeof model> = {
                  role: "action",
                  id: `action-${Date.now()}`,
                  action: parsedEvent.action,
                  status: "pending",
                  model,
                };

                setMessages((prev: ChatMessage[]) => [...prev, actionMessage]);
              }
              break;

            case SSEEventType.REASONING:
              if (typeof parsedEvent.content === "string") {
                assistantMessage = parsedEvent.content;
                const reasoningMessage: AssistantChatMessage = {
                  role: "assistant",
                  id: `assistant-${Date.now()}-${messages.length}`,
                  content: assistantMessage,
                  model,
                };
                setMessages((prev: ChatMessage[]) => [...prev, reasoningMessage]);
              }
              break;

            case SSEEventType.DONE:
              setMessages((prev: ChatMessage[]) => {
                const systemMessage: SystemChatMessage = {
                  role: "system",
                  id: `system-${Date.now()}`,
                  content: parsedEvent.content || "Task completed",
                };

                return [...prev, systemMessage];
              });
              setIsLoading(false);
              break;

            case SSEEventType.ERROR:
              setError(parsedEvent.content);
              setMessages((prev: ChatMessage[]) => [
                ...prev,
                {
                  role: "system",
                  id: `system-${Date.now()}`,
                  content: parsedEvent.content,
                  isError: true,
                },
              ]);
            
              setIsLoading(false);
              break;

            case SSEEventType.SANDBOX_CREATED:
              if (
                parsedEvent.sandboxId &&
                parsedEvent.vncUrl &&
                onSandboxCreatedRef.current
              ) {
                onSandboxCreatedRef.current(
                  parsedEvent.sandboxId,
                  parsedEvent.vncUrl
                );
              }
              break;

            case SSEEventType.ACTION_COMPLETED:
              setMessages((prev: ChatMessage[]) => {
                const lastActionIndex = [...prev]
                  .reverse()
                  .findIndex((msg: ChatMessage) => msg.role === "action");

                if (lastActionIndex !== -1) {
                  const actualIndex = prev.length - 1 - lastActionIndex;

                  return prev.map((msg: ChatMessage, index: number) =>
                    index === actualIndex
                      ? { ...msg, status: "completed" }
                      : msg
                  );
                }

                return prev;
              });
              break;
          }
        }
      }
    } catch (error) {
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : error;
      console.error("[CHAT_CONTEXT] Error sending message:", JSON.stringify(errorDetails, null, 2));
      logError("Error sending message:", errorDetails);
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort(
          new DOMException("Generation stopped by user", "AbortError")
        );
        setIsLoading(false);
      } catch (error) {
        logError("Error stopping generation:", error);
        setIsLoading(false);
      }
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent): string | undefined => {
      e.preventDefault();
      if (!input.trim()) return;

      const content = input.trim();
      setInput("");
      return content;
    },
    [input]
  );

  const value = {
    messages,
    isLoading,
    error,
    input,
    setInput,
    sendMessage,
    stopGeneration,
    clearMessages,
    handleSubmit,
    model,
    setModel,
    activeProvider,
    onSandboxCreated: (
      callback: (sandboxId: string, vncUrl: string) => void
    ) => {
      onSandboxCreatedRef.current = callback;
    },
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
