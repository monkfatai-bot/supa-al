import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getContentTypeLabel } from "@/services/content/prompt-builder";
import type { AiContent } from "@/services/content";

interface GeneratedContentViewerProps {
  content: AiContent;
}

export function GeneratedContentViewer({ content }: GeneratedContentViewerProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content.generated_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-tight">
              {content.title}
            </CardTitle>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">
                {getContentTypeLabel(content.content_type)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {new Date(content.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? (
              <Check className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1 h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-muted rounded-lg p-4">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {content.generated_content}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
