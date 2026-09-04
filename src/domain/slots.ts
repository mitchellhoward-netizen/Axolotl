export type SlotValue = string | boolean | string[] | undefined;
export type CollectedSlots = Record<string, SlotValue>;

export function getString(slots: CollectedSlots, key: string): string | undefined {
  const v = slots[key];
  return typeof v === 'string' ? v : undefined;
}

export function getBool(slots: CollectedSlots, key: string): boolean | undefined {
  const v = slots[key];
  return typeof v === 'boolean' ? v : undefined;
}

export function getStringArray(slots: CollectedSlots, key: string): string[] | undefined {
  const v = slots[key];
  return Array.isArray(v) ? v : undefined;
}

/** The selected students for an action (one or more). */
export function getStudentIds(slots: CollectedSlots): string[] {
  return getStringArray(slots, 'studentIds') ?? [];
}
