import type { ModelMessage } from 'ai';
import type { ChatMessage, ChatMessageAttachment, ToolResult } from '../../types';
import {
  buildHistoricalToolReplayMaps,
  buildHistoricalToolResultReplayText,
  buildHistoricalUserReplayContent,
} from '../../../../components/ai/cattyHistoryReplay';
import {
  buildPromptWithTerminalSelectionAttachments,
  isTerminalSelectionAttachment,
} from '../../../../application/state/terminalSelectionAttachment';
import {
  getOpenAIChatAssistantFieldsForHistoryMessage,
  isProviderContinuationForSource,
  type OpenAIChatAssistantFields,
  type ProviderContinuation,
} from '../../providerContinuation';
import {
  toAssistantModelContent,
  type AssistantContentPart,
  type CattyProviderContinuationContext,
} from '../../../../components/ai/hooks/aiChatStreamingSupport';

const OPENAI_CHAT_ASSISTANT_FIELDS = Symbol('netcatty.openAIChatAssistantFields');

type ModelMessageWithOpenAIChatFields = ModelMessage & {
  [OPENAI_CHAT_ASSISTANT_FIELDS]?: OpenAIChatAssistantFields;
};

function rememberOpenAIChatAssistantFields(
  message: ModelMessage,
  fields: OpenAIChatAssistantFields | undefined,
  fieldsByMessage: Map<ModelMessage, OpenAIChatAssistantFields | undefined>,
): void {
  fieldsByMessage.set(message, fields);
  (message as ModelMessageWithOpenAIChatFields)[OPENAI_CHAT_ASSISTANT_FIELDS] = fields;
}

function getRememberedOpenAIChatAssistantFields(
  message: ModelMessage,
  fieldsByMessage: Map<ModelMessage, OpenAIChatAssistantFields | undefined>,
): OpenAIChatAssistantFields | undefined {
  if (fieldsByMessage.has(message)) return fieldsByMessage.get(message);
  return (message as ModelMessageWithOpenAIChatFields)[OPENAI_CHAT_ASSISTANT_FIELDS];
}

function modelMessageHasToolCall(message: ModelMessage): boolean {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) return false;
  return message.content.some((part) => part && typeof part === 'object' && (part as { type?: string }).type === 'tool-call');
}

/**
 * Normalize chat image payloads for the model message layer.
 *
 * Prefer raw base64 for image/* file parts: AI SDK strips `data:` URLs back to
 * raw base64 before @ai-sdk/openai writes image_url.url. The actual gateway
 * fix is normalizeOpenAIChatImageUrlsInBody in the bridge fetch adapter.
 * This helper still accepts data/http URLs and strips the data: prefix when
 * present so we always hand the SDK clean base64.
 */
export function toVisionImageUrl(mediaType: string, base64OrUrl: string): string {
  const value = typeof base64OrUrl === 'string' ? base64OrUrl.trim() : '';
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  const dataMatch = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i.exec(value);
  if (dataMatch) {
    return dataMatch[2];
  }
  // Already raw base64 (or opaque string) — pass through for the SDK.
  void mediaType;
  return value;
}

export function collectOpenAIChatAssistantFieldsForMessages(
  messages: ModelMessage[],
  fieldsByMessage: Map<ModelMessage, OpenAIChatAssistantFields | undefined>,
): Array<OpenAIChatAssistantFields | undefined> {
  const fields: Array<OpenAIChatAssistantFields | undefined> = [];
  let previousMessageWasTool = false;
  for (const message of messages) {
    const needsContinuationFields = message.role === 'assistant'
      && (modelMessageHasToolCall(message) || previousMessageWasTool);
    if (needsContinuationFields) {
      fields.push(getRememberedOpenAIChatAssistantFields(message, fieldsByMessage));
    }
    previousMessageWasTool = message.role === 'tool';
  }
  return fields;
}

export interface BuildCattySdkMessagesInput {
  allMessages: ChatMessage[];
  includeCurrentUserMessage: boolean;
  trimmed: string;
  attachments?: ChatMessageAttachment[];
  continuationContext: CattyProviderContinuationContext;
  preserveTerminalToolResults?: ReadonlySet<ToolResult>;
  fieldsByMessage: Map<ModelMessage, OpenAIChatAssistantFields | undefined>;
}

export function buildCattySdkMessages(input: BuildCattySdkMessagesInput): ModelMessage[] {
  const {
    allMessages,
    includeCurrentUserMessage,
    trimmed,
    attachments,
    continuationContext,
    preserveTerminalToolResults = new Set<ToolResult>(),
    fieldsByMessage,
  } = input;

  const { resolvedToolCallsByAssistant, toolCallByToolResult } = buildHistoricalToolReplayMaps(allMessages);
  const nextFieldsByMessage = new Map<ModelMessage, OpenAIChatAssistantFields | undefined>();
  const sdkMessages: ModelMessage[] = [];
  let previousHistoryMessageWasToolResult = false;

  for (const m of allMessages) {
    const currentMessageFollowsToolResult = previousHistoryMessageWasToolResult;
    if (m.role === 'user') {
      const messageAttachments = m.attachments ?? m.images;
      sdkMessages.push({
        role: 'user',
        content: buildHistoricalUserReplayContent(m.content, messageAttachments ?? []),
      });
    } else if (m.role === 'assistant') {
      const activeContinuation = isProviderContinuationForSource(
        m.providerContinuation,
        continuationContext.source,
      )
        ? m.providerContinuation
        : undefined;
      const openAIChatAssistantFields = getOpenAIChatAssistantFieldsForHistoryMessage(
        m,
        continuationContext.source,
      );
      if (m.toolCalls?.length) {
        const resolvedToolCalls = resolvedToolCallsByAssistant.get(m);
        const resolvedCalls = resolvedToolCalls
          ? m.toolCalls.filter(tc => resolvedToolCalls.has(tc))
          : [];
        const contentParts: AssistantContentPart[] = [];
        if (resolvedCalls.length > 0) {
          for (const part of activeContinuation?.reasoningParts ?? []) {
            if (!part.text && !part.providerOptions) continue;
            contentParts.push({
              type: 'reasoning' as const,
              text: part.text,
              ...(part.providerOptions ? { providerOptions: part.providerOptions } : {}),
            });
          }
        }
        if (m.content) {
          contentParts.push({
            type: 'text' as const,
            text: m.content,
            ...(activeContinuation?.textProviderOptions ? { providerOptions: activeContinuation.textProviderOptions } : {}),
          });
        }
        for (const tc of resolvedCalls) {
          const providerOptions = activeContinuation?.toolCallProviderOptionsById?.[tc.id];
          contentParts.push({
            type: 'tool-call' as const,
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.arguments ?? {},
            ...(providerOptions ? { providerOptions } : {}),
          });
        }
        if (contentParts.length > 0) {
          const message: ModelMessage = { role: 'assistant', content: toAssistantModelContent(contentParts) };
          sdkMessages.push(message);
          if (resolvedCalls.length > 0) {
            rememberOpenAIChatAssistantFields(message, openAIChatAssistantFields, nextFieldsByMessage);
          }
        }
      } else if (m.content) {
        const contentParts: AssistantContentPart[] = [];
        for (const part of activeContinuation?.reasoningParts ?? []) {
          if (!part.text && !part.providerOptions) continue;
          contentParts.push({
            type: 'reasoning' as const,
            text: part.text,
            ...(part.providerOptions ? { providerOptions: part.providerOptions } : {}),
          });
        }
        contentParts.push({
          type: 'text' as const,
          text: m.content,
          ...(activeContinuation?.textProviderOptions ? { providerOptions: activeContinuation.textProviderOptions } : {}),
        });
        const message: ModelMessage = {
          role: 'assistant',
          content: toAssistantModelContent(contentParts),
        };
        sdkMessages.push(message);
        if (currentMessageFollowsToolResult) {
          rememberOpenAIChatAssistantFields(message, openAIChatAssistantFields, nextFieldsByMessage);
        }
      }
    } else if (m.role === 'tool' && m.toolResults?.length) {
      sdkMessages.push({
        role: 'tool',
        content: m.toolResults.map(tr => {
          const toolCall = toolCallByToolResult.get(tr);
          return {
            type: 'tool-result' as const,
            toolCallId: tr.toolCallId,
            toolName: toolCall?.name ?? 'unknown',
            output: {
              type: 'text' as const,
              value: buildHistoricalToolResultReplayText(tr, toolCall, {
                preserveTerminalOutput: preserveTerminalToolResults.has(tr),
              }),
            },
          };
        }),
      });
    }
    previousHistoryMessageWasToolResult = m.role === 'tool' && !!m.toolResults?.length;
  }

  if (includeCurrentUserMessage) {
    if (attachments?.length) {
      const modelText = buildPromptWithTerminalSelectionAttachments(trimmed, attachments);
      const modelAttachments = attachments.filter(
        (attachment) => !isTerminalSelectionAttachment(attachment),
      );
      if (!modelAttachments.length) {
        sdkMessages.push({ role: 'user', content: modelText });
      } else {
        const parts: Array<{ type: 'text'; text: string } | { type: 'file'; data: string; mediaType: string; filename?: string }> = [];
        parts.push({ type: 'text', text: modelText });
        for (const att of modelAttachments) {
          if (att.mediaType.startsWith('image/')) {
            // Pass raw base64 (or http URL) into the AI SDK file part. The chat
            // provider rewrites image_url.url; gateway-facing data: wrapping is
            // done in normalizeOpenAIChatImageUrlsInBody.
            parts.push({
              type: 'file',
              data: toVisionImageUrl(att.mediaType, att.base64Data),
              mediaType: att.mediaType,
              filename: att.filename,
            });
          } else {
            parts.push({ type: 'file', data: att.base64Data, mediaType: att.mediaType, filename: att.filename });
          }
        }
        sdkMessages.push({ role: 'user', content: parts });
      }
    } else {
      sdkMessages.push({ role: 'user', content: trimmed });
    }
  }

  for (const [message, fields] of nextFieldsByMessage.entries()) {
    fieldsByMessage.set(message, fields);
  }

  return sdkMessages;
}

export function collectToolResultsAfterMessage(
  messages: ChatMessage[],
  messageId: string,
): Set<ToolResult> {
  const results = new Set<ToolResult>();
  let afterMessage = false;
  for (const message of messages) {
    if (message.id === messageId) {
      afterMessage = true;
      continue;
    }
    if (!afterMessage || message.role !== 'tool' || !message.toolResults?.length) continue;
    for (const result of message.toolResults) {
      results.add(result);
    }
  }
  return results;
}

export function createContinuationContext(
  providerConfigId: string,
  providerType: string,
  modelId: string,
): CattyProviderContinuationContext {
  return {
    source: {
      providerConfigId,
      providerType,
      modelId,
    },
    openAIChatAssistantFields: [],
  };
}

export type { CattyProviderContinuationContext, ProviderContinuation };
