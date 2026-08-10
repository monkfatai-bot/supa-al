'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Copy,
  Zap,
  Mail,
  Globe,
  Database,
  BarChart3,
  Users,
  FileText,
  Bell,
  ShoppingCart,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getTemplates, createWorkflowFromTemplate } from '@/services/automation/actions';
import type { AutomationTemplate, TemplateCategory } from '@/services/automation/types';
import { toast } from 'sonner';

// ── Props ────────────────────────────────────────────────────────

interface TemplateLibraryProps {
  workspaceId: string;
}

// ── Constants ────────────────────────────────────────────────────

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'crm', label: 'CRM' },
  { value: 'billing', label: 'Billing' },
  { value: 'project_management', label: 'Project Management' },
  { value: 'communication', label: 'Communication' },
  { value: 'data_processing', label: 'Data Processing' },
  { value: 'ai_automation', label: 'AI Automation' },
  { value: 'custom', label: 'Custom' },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  zap: <Zap className="h-6 w-6" />,
  mail: <Mail className="h-6 w-6" />,
  globe: <Globe className="h-6 w-6" />,
  database: <Database className="h-6 w-6" />,
  'bar-chart': <BarChart3 className="h-6 w-6" />,
  users: <Users className="h-6 w-6" />,
  'file-text': <FileText className="h-6 w-6" />,
  bell: <Bell className="h-6 w-6" />,
  'shopping-cart': <ShoppingCart className="h-6 w-6" />,
  layers: <Layers className="h-6 w-6" />,
};

const CATEGORY_BADGE: Record<TemplateCategory, 'default' | 'secondary' | 'outline'> = {
  onboarding: 'default',
  crm: 'default',
  billing: 'secondary',
  project_management: 'outline',
  communication: 'default',
  data_processing: 'secondary',
  ai_automation: 'default',
  sales: 'default',
  marketing: 'default',
  support: 'default',
  hr: 'secondary',
  finance: 'secondary',
  ecommerce: 'outline',
  education: 'outline',
  ai_content: 'default',
  ai_research: 'secondary',
  operations: 'outline',
  general: 'secondary',
  custom: 'outline',
};

// ── Component ────────────────────────────────────────────────────

export function TemplateLibrary({ workspaceId }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTemplates({
        category: category !== 'all' ? (category as TemplateCategory) : undefined,
        search: search || undefined,
        pageSize: 50,
      });
      setTemplates(res.data);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleUseTemplate = async (template: AutomationTemplate) => {
    setCreatingId(template.id);
    const res = await createWorkflowFromTemplate(workspaceId, template.id, `${template.name} (from template)`);
    if (res.success) {
      toast.success('Workflow created from template!');
    } else {
      toast.error(res.message);
    }
    setCreatingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex overflow-x-auto gap-1 pb-1">
        {CATEGORY_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={category === tab.value ? 'default' : 'outline'}
            size="sm"
            className="whitespace-nowrap shrink-0"
            onClick={() => setCategory(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Template Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No templates found</p>
          <p className="text-xs mt-1">Try a different category or search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardContent className="pt-6 flex flex-col flex-1 gap-3">
                {/* Icon + Category */}
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    {ICON_MAP[template.icon] ?? <Layers className="h-6 w-6" />}
                  </div>
                  <Badge variant={CATEGORY_BADGE[template.category]}>
                    {template.category.replace(/_/g, ' ')}
                  </Badge>
                </div>

                {/* Name + Description */}
                <div>
                  <h3 className="font-semibold text-sm">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {template.description || 'No description'}
                  </p>
                </div>

                {/* Usage count */}
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Copy className="h-3 w-3" />
                  Used {template.usage_count} times
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Use Template button */}
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleUseTemplate(template)}
                  disabled={creatingId === template.id}
                >
                  {creatingId === template.id ? (
                    'Creating...'
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Use Template
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
