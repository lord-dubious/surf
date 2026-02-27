/**
 * Type definitions for chat messages and related functionality
 */
import { ResponseComputerToolCall } from "openai/resources/responses/responses.mjs";
import { ActionEvent, ComputerModel, SSEEventType } from "./api";
import { ComputerAction } from "@/types/anthropic";

/**
 * Role of a chat message
 */
export type MessageRole = "user" | "assistant" | "system" | "action";

export interface ChatTextPart {
  type: "text";
  text: string;
}

export interface ChatImagePart {
  type: "image";
  image: string;
}

export type ChatMessagePart = ChatTextPart | ChatImagePart;
export type ChatMessageContent = string | ChatMessagePart[];
export type ChatTransportMessage = {
  role: "user" | "assistant";
  content: ChatMessageContent;
};

/**
 * Base interface for all chat messages
 */
export interface BaseChatMessage {
  id: string;
  role: MessageRole;
}

/**
 * User message in the chat
 */
export interface UserChatMessage extends BaseChatMessage {
  role: "user";
  content: ChatMessageContent;
}

/**
 * Assistant message in the chat
 */
export interface AssistantChatMessage extends BaseChatMessage {
  role: "assistant";
  content: ChatMessageContent;
  model: ComputerModel;
}

/**
 * System message in the chat
 */
export interface SystemChatMessage extends BaseChatMessage {
  role: "system";
  content: string;
  isError?: boolean;
}

/**
 * Action message in the chat
 */
export interface ActionChatMessage<T extends ComputerModel = ComputerModel>
  extends BaseChatMessage {
  role: "action";
  action: T extends "openai"
    ? ResponseComputerToolCall["action"]
    : ComputerAction;
  status?: "pending" | "completed" | "failed";
  model: ComputerModel;
}

/**
 * Union type for all chat messages
 */
export type ChatMessage<T extends ComputerModel = "openai"> =
  | UserChatMessage
  | AssistantChatMessage
  | SystemChatMessage
  | ActionChatMessage<T>;

/**
 * Chat state interface
 */
export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Parsed SSE event from the server
 */
export interface ParsedSSEEvent<T extends ComputerModel> {
  type: SSEEventType;
  content?: any;
  action?: ActionEvent<T>["action"];
  callId?: string;
  sandboxId?: string;
  vncUrl?: string;
}

/**
 * Chat API request parameters
 */
export interface ChatApiRequest {
  messages: ChatTransportMessage[];
  sandboxId?: string;
  environment?: string;
  resolution: [number, number];
  model?: ComputerModel;
  /** Provider configuration for extended model support */
  providerConfig?: {
    id: string;
    name: string;
    type: string;
    apiKey: string;
    baseUrl?: string;
    model: string;
    useNativeComputerUse: boolean;
  };
}

/**
 * Options for sending a message
 */
export interface SendMessageOptions {
  content: string;
  sandboxId?: string;
  environment?: string;
  resolution: [number, number];
  model?: ComputerModel;
  /** Provider configuration for extended model support */
  providerConfig?: ChatApiRequest["providerConfig"];
}
