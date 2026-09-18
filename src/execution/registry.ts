import type { Action } from "./types.js";

const registry = new Map<string, Action>();

export function registerAction(action: Action): void {
  if (registry.has(action.name)) {
    throw new Error(`Action already registered: ${action.name}`);
  }
  registry.set(action.name, action);
}

export function getActionRegistry(): Map<string, Action> {
  return registry;
}

export function clearActionRegistry(): void {
  registry.clear();
}
