/**
 * Supa AI — Phase 9 Workspace AI assistant.
 *
 * Grounds answers in the workspace knowledge_base. The flow:
 *
 *   1. Fetch the top-K knowledge articles whose title or content matches
 *      the user's question (simple ILIKE — a future phase can swap in
 *      proper vector similarity search via `pgvector`).
 *   2. Build a system prompt that includes the workspace KB context.
 *   3. Call `ai.chat()` with the user's question.
 *   4. Return the answer + the list of cited article ids.
 *
 * Throws {@link ConfigurationError} when no AI provider is configured
 * (mirrors {@link EmployeeService.chat}).
 *
 * @module @/lib/workspace/ai-assistant
 */
import "server-only";

import { ai, type ChatMessage } from "@/lib/ai";
import { ConfigurationError } from "@/lib/errors";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { KnowledgeArticle, WorkspaceAiAnswer } from "./types";
import {
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const MAX_CONTEXT_ARTICLES = 4;
const MAX_ARTICLE_CHARS = 4000;

class AiAssistant {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Answer a question grounded in the workspace knowledge base.
   * Returns the answer + cited article ids.
   */
  async ask(
    workspaceId: string,
    userId: string,
    question: string,
  ): Promise<WorkspaceAiAnswer> {
    const q = question?.trim();
    if (!q) {
      throw new ValidationError("Question is required.");
    }
    await assertMember(this.supabase, workspaceId, userId);

    try {
      const articles = await this.retrieveKnowledge(workspaceId, q);

      // Build the system prompt with the KB context.
      const context = articles
        .map((a, i) => {
          const body = (a.content ?? "").slice(0, MAX_ARTICLE_CHARS);
          return `### Article ${i + 1}: ${a.title}\n${body}`;
        })
        .join("\n\n");

      const systemPrompt = articles.length > 0
        ? `You are a helpful workspace assistant. Use the knowledge-base context below to answer the user's question. If the context does not contain the answer, say so honestly. Cite articles by their title when you use them.\n\n${context}`
        : "You are a helpful workspace assistant. The knowledge base is empty for this question, so answer generally and let the user know.";

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: q },
      ];

      const response = await ai.chat(
        { messages },
        { feature: "workspace-assistant", userId },
      );

      return {
        answer: response.message.content,
        citedArticles: articles.map((a) => a.id),
        provider: response.provider,
        model: response.model,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      if (
        err instanceof NotFoundError ||
        err instanceof ValidationError ||
        err instanceof ConfigurationError
      ) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure in workspace AI assistant.", {
        workspaceId,
      });
    }
  }

  /**
   * Retrieve the top-K knowledge articles whose title or content matches
   * `query`. Uses ILIKE — a future phase can swap in pgvector similarity.
   */
  private async retrieveKnowledge(
    workspaceId: string,
    query: string,
  ): Promise<KnowledgeArticle[]> {
    const term = query.replace(/[%_]/g, (m) => `\\${m}`).slice(0, 200);

    const { data, error } = await this.supabase
      .from("knowledge_base")
      .select()
      .eq("workspace_id", workspaceId)
      .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(MAX_CONTEXT_ARTICLES);

    if (error) throw toDbError(error, "ai-assistant.retrieveKnowledge failed");
    return data ?? [];
  }
}

export async function createAiAssistant(): Promise<AiAssistant> {
  const supabase = await createSupabaseServerClient();
  return new AiAssistant(supabase);
}

export { AiAssistant };
