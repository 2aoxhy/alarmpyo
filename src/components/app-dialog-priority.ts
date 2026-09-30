export type AppDialogPriorityOwners = ReadonlySet<string>;

export function updateAppDialogPriorityOwners(
  current: AppDialogPriorityOwners,
  owner: string,
  visible: boolean,
): AppDialogPriorityOwners {
  if (current.has(owner) === visible) return current;

  const next = new Set(current);
  if (visible) next.add(owner);
  else next.delete(owner);
  return next;
}
