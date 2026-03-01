import { ResponseComputerToolCall } from "openai/resources/responses/responses.mjs";
import { ActionEvent, ComputerModel, SSEEventType } from "./api";
import { ComputerAction } from "@/types/anthropic";

export type MessageRole = "user" | "assistant" | "system" | "action";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string };

export type ChatMessageContent = string | ChatContentPart[];

export interface BaseChatMessage {
  id: string;
  role: MessageRole;
}

export interface UserChatMessage extends BaseChatMessage {
  role: "user";
  content: ChatMessageContent;
}

export interface AssistantChatMessage extends BaseChatMessage {
  role: "assistant";
  content: ChatMessageContent;
  model: ComputerModel;
}

export interface SystemChatMessage extends BaseChatMessage {
  role: "system";
  content: string;
  isError?: boolean;
}

export interface ActionChatMessage<T extends ComputerModel = ComputerModel> extends BaseChatMessage {
  role: "action";
  action: T extends "openai" ? ResponseComputerToolCall["action"] : ComputerAction;
  status?: "pending" | "completed" | "failed";
  model: ComputerModel;
}

export type ChatMessage<T extends ComputerModel = "openai"> =
  | UserChatMessage
  | AssistantChatMessage
  | SystemChatMessage
  | ActionChatMessage<T>;

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

export interface ParsedSSEEvent<T extends ComputerModel> {
  type: SSEEventType;
  content?: string;
  action?: ActionEvent<T>["action"];
  callId?: string;
  sandboxId?: string;
  vncUrl?: string;
  stepNumber?: number;
}

export interface ChatApiRequest {
  messages: { role: "user" | "assistant"; content: ChatMessageContent }[];
  sandboxId?: string;
  environment?: string;
  resolution: [number, number];
  model?: ComputerModel;
  providerConfig?: {
    id: string;
    name: string;
    type: string;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    useNativeComputerUse: boolean;
  };
}

export interface SendMessageOptions {
  content: string;
  sandboxId?: string;
  environment?: string;
  resolution: [number, number];
  model?: ComputerModel;
  providerConfig?: ChatApiRequest["providerConfig"];
}
