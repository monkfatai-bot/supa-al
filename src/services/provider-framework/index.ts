export * from "./types";
export { getInstance } from "./registry";
// Register all adapters on first import (side-effect import)
import "./adapters/index";
