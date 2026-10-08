/**
 * Shared validation helpers for forms.
 */

/** Exactly 10 digits (strips leading/trailing spaces first). */
export function validatePhone(value: string): string | null {
  const stripped = value.trim();
  if (!stripped) return null; // empty = not filled, let `required` handle it
  if (!/^\d{10}$/.test(stripped)) return "Mobile number must be exactly 10 digits.";
  return null;
}

/**
 * Name must not contain digits or special symbols – only letters (any script),
 * spaces, hyphens and apostrophes are permitted.
 */
export function validateName(value: string): string | null {
  const stripped = value.trim();
  if (!stripped) return null; // empty = let `required` handle it
  // Allow unicode letters, spaces, hyphens and apostrophes
  if (/[0-9]/.test(stripped)) return "Name must not contain numbers.";
  if (/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\u0900-\u097F '\-]/.test(stripped)) return "Name must not contain special symbols.";
  return null;
}
