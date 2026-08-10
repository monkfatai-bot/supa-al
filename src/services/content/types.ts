/**
 * Content type definitions shared across the content service.
 */

import type { AiContent, ContentType } from "@/types/generated/database";

/** Labels and descriptions for each content type. */
export const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; description: string }[] = [
  {
    value: "blog_post",
    label: "Blog Post",
    description: "Full-length blog articles with structure and flow",
  },
  {
    value: "social_media",
    label: "Social Media Post",
    description: "Engaging posts for Twitter, LinkedIn, Instagram",
  },
  {
    value: "marketing_copy",
    label: "Marketing Copy",
    description: "Persuasive copy for ads, landing pages, campaigns",
  },
  {
    value: "product_description",
    label: "Product Description",
    description: "Compelling product descriptions for e-commerce",
  },
  {
    value: "email_draft",
    label: "Email Draft",
    description: "Professional emails for outreach, newsletters, follow-ups",
  },
  {
    value: "general_writing",
    label: "General Writing",
    description: "Any other type of written content",
  },
];

export interface ContentActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface GenerateContentResponse extends ContentActionResponse {
 content?: AiContent;
}

export type { AiContent, ContentType };
