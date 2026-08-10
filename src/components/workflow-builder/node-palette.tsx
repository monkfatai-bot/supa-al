'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Zap,
  Sparkles,
  GitBranch,
  Database,
  Bell,
  Briefcase,
  Plug,
  MousePointerClick,
  Clock,
  Globe,
  User,
  Users,
  MessageSquare,
  ImageIcon,
  Video,
  Mic,
  Languages,
  FileText,
  Tag,
  ScanText,
  GitMerge,
  GitFork,
  Split,
  Repeat,
  Timer,
  LayoutGrid,
  OctagonX,
  Variable,
  Braces,
  ArrowRightLeft,
  AlignLeft,
  Calculator,
  RefreshCw,
  Filter,
  MessageCircle,
  Send,
  Hash,
  AtSign,
  Smartphone,
  Contact,
  UserPlus,
  FileCheck,
  CreditCard,
  Package,
  DollarSign,
  CheckSquare,
  Calendar,
  Brain,
  Bot,
  Cpu,
  Github,
  HardDrive,
  ShoppingBag,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useWorkflowBuilderStore } from '@/services/workflow-builder/store';
import { nodeRegistry, type NodeDefinition } from '@/services/workflow-builder';
import { cn } from '@/lib/utils';

// ─── Icon Map ───────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MousePointerClick, Clock, Globe, Zap, User, Users, Sparkles, Briefcase,
  MessageSquare, ImageIcon, Video, Mic, Languages, FileText, Tag, Database,
  ScanText, GitBranch, GitMerge, GitFork, Split, Repeat, Timer, LayoutGrid,
  OctagonX, Variable, Braces, ArrowRightLeft, AlignLeft, Calculator,
  RefreshCw, Filter, Bell, MessageCircle, Send, Hash, AtSign, Smartphone,
  Contact, UserPlus, Receipt, FileCheck, CreditCard, Package, DollarSign,
  CheckSquare, Calendar, Brain, Bot, Cpu, Github, HardDrive, ShoppingBag, Plug,
};

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Comp = ICON_MAP[name] ?? Variable;
  return <Comp className={className} />;
}

// ─── Category Helpers ────────────────────────────────────────

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  trigger: Zap,
  ai: Sparkles,
  logic: GitBranch,
  data: Database,
  communication: Bell,
  business: Briefcase,
  integration: Plug,
};

const CATEGORY_BADGE_VARIANT: Record<string, string> = {
  trigger: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  ai: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  logic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  data: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  communication: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  business: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  integration: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

// ─── Component ──────────────────────────────────────────────

export function NodePalette() {
  const { searchQuery, searchCategory, setSearch, panels, togglePanel } =
    useWorkflowBuilderStore();
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const categories = useMemo(() => nodeRegistry.getCategories(), []);

  const filteredNodes = useMemo(() => {
    let nodes = searchQuery
      ? nodeRegistry.search(searchQuery)
      : nodeRegistry.getAll();
    if (searchCategory) {
      nodes = nodes.filter((n) => n.category === searchCategory);
    }
    return nodes;
  }, [searchQuery, searchCategory]);

  const nodesByCategory = useMemo(() => {
    const map = new Map<string, NodeDefinition[]>();
    for (const node of filteredNodes) {
      const list = map.get(node.category) ?? [];
      list.push(node);
      map.set(node.category, list);
    }
    return map;
  }, [filteredNodes]);

  const activeCategories = useMemo(
    () => categories.filter((c) => nodesByCategory.has(c.name)),
    [categories, nodesByCategory],
  );

  const defaultOpen = useMemo(() => {
    if (searchCategory) return [searchCategory];
    if (!searchQuery) return categories.map((c) => c.name);
    return activeCategories.map((c) => c.name);
  }, [searchCategory, searchQuery, categories, activeCategories]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeDef: NodeDefinition) => {
      e.dataTransfer.setData('application/reactflow', JSON.stringify(nodeDef));
      e.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
 setSearch(e.target.value, searchCategory);
 },
  [setSearch, searchCategory],
  );

  const handleCategoryFilter = useCallback(
    (cat: string) => {
      setSearch(searchQuery, searchCategory === cat ? null : cat);
    },
    [setSearch, searchQuery, searchCategory],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, filteredNodes.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && focusedIdx >= 0 && filteredNodes[focusedIdx]) {
        cardRefs.current[focusedIdx]?.click();
      }
    },
    [filteredNodes, focusedIdx],
  );

  return (
    <AnimatePresence initial={false}>
      {panels.left && (
        <motion.aside
          key="node-palette"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex flex-col border-r bg-background overflow-hidden"
          role="complementary"
          aria-label="Node palette"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <h2 className="text-sm font-semibold">Nodes</h2>
            <button
              onClick={() => togglePanel('left')}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Collapse palette"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                placeholder="Search nodes…"
                className="h-9 pl-8 text-sm"
                aria-label="Search nodes"
              />
            </div>
          </div>

          {/* Category chips */}
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => handleCategoryFilter(cat.name)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  searchCategory === cat.name
                    ? CATEGORY_BADGE_VARIANT[cat.name]
                    : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Node list */}
          <ScrollArea className="flex-1 px-2">
            {filteredNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  No nodes found
                </p>
                {searchQuery && (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    for &quot;{searchQuery}&quot;
                  </p>
                )}
              </div>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={defaultOpen}
                className="pb-4"
              >
                {activeCategories.map((cat) => {
                  const catNodes = nodesByCategory.get(cat.name) ?? [];
                  const CatIcon = CATEGORY_ICON_MAP[cat.name] ?? Variable;
                  return (
                    <AccordionItem
                      key={cat.name}
                      value={cat.name}
                      className="border-b-0"
                    >
                      <AccordionTrigger className="py-2 px-1 text-xs font-semibold hover:no-underline">
                        <div className="flex items-center gap-2">
                          <CatIcon className="h-3.5 w-3.5" />
                          <span>{cat.label}</span>
                          <Badge
                            variant="secondary"
                            className="ml-1 h-4 min-w-4 px-1 text-[10px]"
                          >
                            {catNodes.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-1 pb-1">
                        {catNodes.map((nodeDef) => {
                          const idx = filteredNodes.indexOf(nodeDef);
                          return (
                            <div
                              key={nodeDef.type}
                              ref={(el) => { cardRefs.current[idx] = el; }}
                              draggable
                              onDragStart={(e) => handleDragStart(e, nodeDef)}
                              className={cn(
                                'flex cursor-grab items-start gap-2.5 rounded-lg border p-2.5 transition-colors',
                                'hover:bg-accent active:cursor-grabbing',
                                focusedIdx === idx && 'ring-2 ring-ring',
                              )}
                              role="option"
                              aria-selected={focusedIdx === idx}
                              aria-label={`Drag ${nodeDef.label} to canvas`}
                              tabIndex={0}
                            >
                              <div
                                className={cn(
                                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                                  CATEGORY_BADGE_VARIANT[nodeDef.category],
                                )}
                              >
                                <DynamicIcon
                                  name={nodeDef.icon}
                                  className="h-3.5 w-3.5"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">
                                  {nodeDef.label}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {nodeDef.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </ScrollArea>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ─── Collapsed Toggle (shown when panel is closed) ─────────

export function NodePaletteToggle() {
  const { panels, togglePanel } = useWorkflowBuilderStore();
  if (panels.left) return null;
  return (
    <button
      onClick={() => togglePanel('left')}
      className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      aria-label="Open node palette"
    >
      <PanelLeftOpen className="h-3.5 w-3.5" />
      Nodes
    </button>
  );
}
