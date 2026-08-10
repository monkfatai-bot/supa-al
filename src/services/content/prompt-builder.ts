/**
 * Builds system prompts for each content type.
 * Keeps prompt engineering separate from business logic.
 */

import type { ContentType } from "@/types/generated/database";

const SYSTEM_PROMPTS: Record<ContentType, string> = {
  blog_post: `You are an expert blog writer. Write well-structured, engaging blog content.
Use clear headings, short paragraphs, and a conversational yet professional tone.
Include an attention-grabbing introduction and a compelling conclusion with a call to action.`,

  social_media: `You are a social media content expert. Write concise, engaging posts optimized for social platforms.
Use emojis sparingly, include relevant hashtags, and craft a hook in the first line.
Keep the tone platform-appropriate and encourage engagement.`,

  marketing_copy: `You are a world-class marketing copywriter. Write persuasive, conversion-focused marketing copy.
Use strong headlines, benefit-driven language, social proof elements, and clear calls to action.
Focus on the value proposition and address customer pain points.`,

  product_description: `You are an e-commerce product description specialist. Write compelling product descriptions.
Highlight key features and benefits, use sensory language, and address common customer questions.
Structure with a hook, features list, and persuasive closing.`,

  email_draft: `You are a professional email writer. Write clear, effective emails.
Use an appropriate subject line, professional greeting, concise body, and clear call to action.
Maintain the right tone for the context (formal, friendly, persuasive).`,

  general_writing: `You are a versatile writing assistant. Write clear, well-organized content.
Adapt your tone and style to match the user's request.
Focus on clarity, coherence, and quality.`,
};

export function getSystemPrompt(contentType: ContentType): string {
  return SYSTEM_PROMPTS[contentType];
}

/** Build a user-facing label for a content type value. */
export function getContentTypeLabel(value: ContentType): string {
  const labels: Record<ContentType, string> = {
    blog_post: "Blog Post",
    social_media: "Social Media Post",
    marketing_copy: "Marketing Copy",
    product_description: "Product Description",
    email_draft: "Email Draft",
    general_writing: "General Writing",
  };
  return labels[value];
}
