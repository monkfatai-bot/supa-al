/**
 * @module workflow-builder/validator
 * @description Workflow validation engine for the Visual Workflow Builder.
 *
 * Performs a comprehensive set of static checks on a workflow graph
 * (nodes + edges) and returns an array of {@link ValidationError}
 * objects. Each error is classified by `severity` (error vs. warning)
 * and `type` so the UI can render targeted feedback.
 *
 * The validator is purely functional – it has no side effects and
 * can be called from both client components and server actions.
 *
 * @example
 * ```ts
 * import { validateWorkflow } from '@/services/workflow-builder';
 *
 * const errors = validateWorkflow(nodes, edges);
 * const hasErrors = errors.some(e => e.severity === 'error');
 * ```
 */
import type { Node, Edge } from '@xyflow/react';
import type { ValidationError, NodeDefinition } from './types';
import { nodeRegistry } from './node-registry';

// ─── Internal helpers ──────────────────────────────────────────────────────────────────────

/**
 * Build a `Set` of node IDs that have at least one **incoming** edge.
 *
 * A node is "connected" when some edge's `target` equals the node's ID.
 */
function buildConnectedNodeSet(edges: Edge[]): Set<string> {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.target);
  }
  return connected;
}

/**
 * Build a `Set` of node IDs that are trigger-type nodes.
 *
 * Trigger nodes are identified by querying the registry – they are
 * the only category whose definitions have an empty `inputs` array.
 */
function buildTriggerNodeSet(nodes: Node[]): Set<string> {
  const triggers = new Set<string>();
  for (const node of nodes) {
    if (!node.type) continue;
    const def = nodeRegistry.getByType(node.type);
    if (def?.category === 'trigger') {
      triggers.add(node.id);
    }
  }
  return triggers;
}


/**
 * Build an adjacency list (node-id → array of downstream node-ids)
 * from the edge list.
 *
 * Used for cycle detection and reachability analysis.
 */
function buildAdjacencyList(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const neighbours = adj.get(edge.source) ?? [];
    neighbours.push(edge.target);
    adj.set(edge.source, neighbours);
  }
  return adj;
}

/**
 * Detect cycles in the directed graph using iterative DFS with
 * a three-colour marking scheme.
 *
 * - **White (0)** – not yet visited.
 * - **Grey (1)**  – currently on the recursion stack.
 * - **Black (2)** – fully explored, no cycle reachable.
 *
 * @param nodeIds - All node IDs in the graph.
 * @param adj     - Adjacency list from {@link buildAdjacencyList}.
 * @returns Array of node IDs that participate in at least one cycle.
 */
function detectCycles(nodeIds: string[], adj: Map<string, string[]>): string[][] {
  const colour = new Map<string, number>(); // 0=white, 1=grey, 2=black
  const cycles: string[][] = [];

  for (const id of nodeIds) {
    colour.set(id, 0);
  }

  /**
   * Iterative DFS that tracks the path for cycle reporting.
   * Returns the cycle path if one is found, otherwise `null`.
   */
  function dfs(startId: string): string[] | null {
    const stack: Array<{ nodeId: string; neighbourIdx: number }> = [{ nodeId: startId, neighbourIdx: 0 }];
    colour.set(startId, 1);
    const path: string[] = [startId];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbours = adj.get(frame.nodeId) ?? [];

      if (frame.neighbourIdx >= neighbours.length) {
        // All neighbours explored – backtrack.
        colour.set(frame.nodeId, 2);
        path.pop();
        stack.pop();
        continue;
      }

      const neighbour = neighbours[frame.neighbourIdx]!;
      frame.neighbourIdx++;

      const neighbourColour = colour.get(neighbour) ?? 0;

      if (neighbourColour === 1) {
        // Found a back-edge – extract the cycle.
        const cycleStart = path.indexOf(neighbour);
        return [...path.slice(cycleStart), neighbour];
      }

      if (neighbourColour === 0) {
        colour.set(neighbour, 1);
        path.push(neighbour);
        stack.push({ nodeId: neighbour, neighbourIdx: 0 });
      }
    }

    return null;
  }

  for (const id of nodeIds) {
    if ((colour.get(id) ?? 0) === 0) {
      const cycle = dfs(id);
      if (cycle) {
        cycles.push(cycle);
      }
    }
  }

  return cycles;
}

// ─── Validation checks ────────────────────────────────────────────────────────────────────

/**
 * Check for edges that reference node IDs that do not exist in the
 * current node set.
 */
function checkMissingNodes(nodes: Node[], edges: Edge[]): ValidationError[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const errors: ValidationError[] = [];

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        edgeId: edge.id,
        type: 'missing_node',
        message: `Edge "${edge.id}" references source node "${edge.source}" which does not exist.`,
        severity: 'error',
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        type: 'missing_node',
        message: `Edge "${edge.id}" references target node "${edge.target}" which does not exist.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

/**
 * Check that the workflow contains at least one trigger node.
 *
 * A workflow without a trigger cannot be started.
 */
function checkMissingTrigger(triggerNodeIds: Set<string>): ValidationError[] {
  if (triggerNodeIds.size > 0) return [];

  return [
    {
      type: 'missing_connection',
      message: 'Workflow must contain at least one trigger node to start execution.',
      severity: 'error',
    },
  ];
}

/**
 * Warn when a workflow has more than one trigger node.
 *
 * Multiple triggers are technically supported (the workflow runs
 * when any of them fires) but it can be surprising, so we warn.
 */
function checkMultipleTriggers(triggerNodeIds: Set<string>): ValidationError[] {
  if (triggerNodeIds.size <= 1) return [];

  const ids = [...triggerNodeIds];
  return [
    {
      type: 'missing_connection',
      message: `Workflow has ${triggerNodeIds.size} trigger nodes (${ids.join(', ')}). Only one trigger is recommended per workflow.`,
      severity: 'warning',
    },
  ];
}

/**
 * Check for circular references (cycles) in the workflow graph.
 *
 * Cycles cause infinite loops at runtime and must be resolved
 * before the workflow can be saved or executed.
 */
function checkCircularReferences(
  nodeIds: string[],
  edges: Edge[],
): ValidationError[] {
  const adj = buildAdjacencyList(edges);
  const cycles = detectCycles(nodeIds, adj);

  return cycles.map((cycle) => ({
    nodeId: cycle[0],
    type: 'circular_reference' as const,
    message: `Circular reference detected: ${cycle.join(' → ')}`,
    severity: 'error' as const,
  }));
}

/**
 * Check for invalid edge connections.
 *
 * Rules enforced:
 * 1. A trigger node must never be the **target** of an edge.
 * 2. Both the source handle and target handle types must be
 *    compatible with the node definition (source handles produce,
 *    target handles consume).
 */
function checkInvalidConnections(
  nodes: Node[],
  edges: Edge[],
  triggerNodeIds: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Build a map of node ID → NodeDefinition for quick lookup
  const defMap = new Map<string, NodeDefinition>();
  for (const node of nodes) {
    if (!node.type) continue;
    const def = nodeRegistry.getByType(node.type);
    if (def) defMap.set(node.id, def);
  }

  for (const edge of edges) {
    // Rule 1: triggers cannot be targets
    if (triggerNodeIds.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        nodeId: edge.target,
        type: 'invalid_connection',
        message: `Node "${edge.target}" is a trigger and cannot receive incoming connections.`,
        severity: 'error',
      });
      continue;
    }

    // Rule 2: validate handle types
    const sourceDef = defMap.get(edge.source);
    const targetDef = defMap.get(edge.target);

    if (sourceDef && edge.sourceHandle) {
      const handleExists = sourceDef.outputs.some((h) => h.id === edge.sourceHandle);
      if (!handleExists) {
        errors.push({
          edgeId: edge.id,
          nodeId: edge.source,
          type: 'invalid_connection',
          message: `Source handle "${edge.sourceHandle}" does not exist on node "${edge.source}" (${sourceDef.type}).`,
          severity: 'error',
        });
      }
    }

    if (targetDef && edge.targetHandle) {
      const handleExists = targetDef.inputs.some((h) => h.id === edge.targetHandle);
      if (!handleExists) {
        errors.push({
          edgeId: edge.id,
          nodeId: edge.target,
          type: 'invalid_connection',
          message: `Target handle "${edge.targetHandle}" does not exist on node "${edge.target}" (${targetDef.type}).`,
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

/**
 * Check for orphan nodes – non-trigger nodes that have no incoming
 * edge and therefore can never be reached during execution.
 */
function checkOrphanNodes(
  nodes: Node[],
  connectedNodeIds: Set<string>,
  triggerNodeIds: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    // Triggers are expected to have no incoming connections
    if (triggerNodeIds.has(node.id)) continue;
    // Nodes that have incoming connections are not orphans
    if (connectedNodeIds.has(node.id)) continue;

    errors.push({
      nodeId: node.id,
      type: 'missing_connection',
      message: `Node "${node.id}" (${node.type || 'unknown'}) has no incoming connection and will never execute.`,
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Check that all required configuration fields are present and
 * non-empty on every node.
 *
 * The required fields are defined in the node's registry
 * {@link NodeDefinition.fields} entries where `required: true`.
 */
function checkMissingConfig(nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (!node.type) continue;
    const def = nodeRegistry.getByType(node.type);
    if (!def) continue;

    // Extract the node's current config from its ReactFlow data
    const config = (node.data as Record<string, unknown>)?.config as
      | Record<string, unknown>
      | undefined;

    for (const field of def.fields) {
      if (!field.required) continue;

      const value = config?.[field.key];

      // Consider a value "missing" if it is undefined, null, or an empty string
      if (value === undefined || value === null || value === '') {
        errors.push({
          nodeId: node.id,
          type: 'missing_config',
          message: `Required field "${field.label}" (${field.key}) is empty on node "${node.id}" (${def.label}).`,
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

/**
 * Scan node configuration values for variable references ({{...}})
 * and validate that the reference syntax is correct.
 *
 * This is a **syntactic** check only – it does not verify that the
 * referenced variable actually exists at runtime (that requires
 * the full execution context).
 */
function checkInvalidVariables(nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (!node.type) continue;
    const def = nodeRegistry.getByType(node.type);
    if (!def) continue;

    const config = (node.data as Record<string, unknown>)?.config as
      | Record<string, unknown>
      | undefined;
    if (!config) continue;

    for (const field of def.fields) {
      const value = config[field.key];
      if (typeof value !== 'string') continue;

      // Find all {{...}} patterns
      const refPattern = /\{\{([^}]+)\}\}/g;
      let match: RegExpExecArray | null;

      while ((match = refPattern.exec(value)) !== null) {
        const rawRef = match[1]?.trim();
        if (!rawRef) {
          errors.push({
            nodeId: node.id,
            type: 'invalid_variable',
            message: `Empty variable reference in field "${field.label}" on node "${node.id}".`,
            severity: 'error',
          });
        } else if (!/^[\w.[\]]+$/.test(rawRef)) {
          errors.push({
            nodeId: node.id,
            type: 'invalid_variable',
            message: `Invalid variable reference "{{${rawRef}}}" in field "${field.label}" on node "${node.id}". Only alphanumeric characters, dots, and brackets are allowed.`,
            severity: 'error',
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Warn when a `stop_workflow` node has no incoming connection,
 * meaning it can never actually halt the workflow.
 */
function checkStopWithoutConnection(
  nodes: Node[],
  connectedNodeIds: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (node.type !== 'stop_workflow') continue;
    if (connectedNodeIds.has(node.id)) continue;

    errors.push({
      nodeId: node.id,
      type: 'missing_connection',
      message: `Stop Workflow node "${node.id}" has no incoming connection and will never be reached.`,
      severity: 'warning',
    });
  }

  return errors;
}

// ─── Public API ──────────────────────────────────────────────────────────────────────

/**
 * Validate a workflow graph and return all detected issues.
 *
 * The function runs a battery of independent checks and aggregates
 * the results. Checks are ordered so that structural errors (missing
 * nodes, cycles) appear before configuration errors (missing fields,
 * bad variables).
 *
 * @param nodes - The ReactFlow node array (or a subset of it).
 * @param edges - The ReactFlow edge array.
 * @returns An array of {@link ValidationError}. An empty array means
 *          the workflow is valid and ready to save/execute.
 *
 * @example
 * ```ts
 * const errors = validateWorkflow(nodes, edges);
 * const criticalErrors = errors.filter(e => e.severity === 'error');
 * if (criticalErrors.length === 0) {
 *   await saveWorkflow();
 * }
 * ```
 */
export function validateWorkflow(
  nodes: Node[],
  edges: Edge[],
): ValidationError[] {
  // Short-circuit for empty workflows – they are trivially valid
  // (though they may not be useful).
  if (nodes.length === 0) return [];

  const nodeIds = nodes.map((n) => n.id);
  const connectedNodeIds = buildConnectedNodeSet(edges);
  const triggerNodeIds = buildTriggerNodeSet(nodes);

  return [
    // Structural checks (highest priority)
    ...checkMissingNodes(nodes, edges),
    ...checkMissingTrigger(triggerNodeIds),
    ...checkMultipleTriggers(triggerNodeIds),
    ...checkCircularReferences(nodeIds, edges),
    ...checkInvalidConnections(nodes, edges, triggerNodeIds),
    ...checkOrphanNodes(nodes, connectedNodeIds, triggerNodeIds),

    // Configuration checks
    ...checkMissingConfig(nodes),
    ...checkInvalidVariables(nodes),

    // Warnings (lowest priority)
    ...checkStopWithoutConnection(nodes, connectedNodeIds),
  ];
}
