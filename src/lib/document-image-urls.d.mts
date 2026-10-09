export type DocumentImageUrlOptions = { bucket?: string; endpoint?: string; region?: string };
export function documentImageKeyFromUrl(value: string | null | undefined, options?: DocumentImageUrlOptions): string | undefined;
export function encodedKeyPattern(key: string): string;
