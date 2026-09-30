// @ts-expect-error Vitest supplies raw source imports for boundary contracts.
import boot from '../runtime/store/boot-coordinator.ts?raw';
// @ts-expect-error Vitest supplies raw source imports for boundary contracts.
import commands from '../runtime/store/commands-coordinator.ts?raw';
// @ts-expect-error Vitest supplies raw source imports for boundary contracts.
import persistence from '../runtime/store/persistence-coordinator.ts?raw';
// @ts-expect-error Vitest supplies raw source imports for boundary contracts.
import restore from '../runtime/store/restore-coordinator.ts?raw';
// @ts-expect-error Vitest supplies raw source imports for boundary contracts.
import runtime from '../runtime/store/runtime-coordinator.ts?raw';
// @ts-expect-error Vitest supplies raw source imports for boundary contracts.
import lifecycle from '../runtime/store/lifecycle-coordinator.ts?raw';

export const coordinatorSources = { boot, commands, persistence, restore, runtime, lifecycle } as const;
export const allCoordinatorSource = Object.values(coordinatorSources).join('\n');

/** Scope sequencing assertions to one registered operation, not the old Provider. */
export function operationSource(source: string, name: string): string {
  const start = source.indexOf(`operations.${name} =`);
  if (start < 0) throw new Error(`Missing store operation: ${name}`);
  const nextOperation = source.slice(start + 1).search(/^[\t ]*operations\.\w+\s*=/m);
  return source.slice(start, nextOperation < 0 ? source.length : start + 1 + nextOperation);
}
