/** Platform privileges are writable only by a trusted server/operator. */
export const adminProfileFields = {
  isAdmin: { type: "boolean", defaultValue: false, input: false },
} as const;
