/** A value draft keeps the exact version and revision that were revealed. */
export interface InlineSecretEdit {
  id: string;
  key: string;
  version: number;
  revision: number;
  originalValue: string;
  value: string;
}
