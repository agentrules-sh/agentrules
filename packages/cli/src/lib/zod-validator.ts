import type { z } from "zod";

/**
 * Creates a validator function from a Zod schema.
 * Returns error message if invalid, undefined if valid.
 */
export function check<T extends z.ZodType>(schema: T) {
  return (value: unknown): string | undefined => {
    const result = schema.safeParse(value);
    if (!result.success) return result.error.issues[0]?.message;
    return;
  };
}
