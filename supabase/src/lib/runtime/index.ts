/**
 * Supa AI — Phase 12 Supa OS Runtime barrel (server-only).
 *
 * @module @/lib/runtime
 */
import "server-only";

export * from "./types";
export { RuntimeService, getRuntimeService, getRuntimeServiceWith } from "./runtime-service";
export { MultiAgentOrchestrator, getOrchestrator } from "./orchestrator";
export { AgentCommunicationBus, getCommunicationBus } from "./communication-bus";
