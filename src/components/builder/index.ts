/**
 * Supa AI — Phase 9B Builder — components barrel.
 *
 * Re-exports every builder component so the dashboard section-router can
 * import a single `BuilderView` symbol.
 *
 * @module @/components/builder
 */
export { BuilderView } from "./builder-view";
export { WorkflowCanvas } from "./workflow-canvas";
export { NodePalette } from "./node-palette";
export { ConfigPanel } from "./config-panel";
export { DebugConsole } from "./debug-console";
export { VersionManager } from "./version-manager";
export { CommentsPanel } from "./comments-panel";
