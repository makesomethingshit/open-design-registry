export const defaultPageSize = 24;
export const maxPageSize = 100;

export function parsePageSize(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maxPageSize) : defaultPageSize;
}

export function paginationRequested(params: URLSearchParams) {
  return params.has("cursor") || params.has("limit") || params.has("take") || params.has("pageSize");
}

export function pageCursor(value: string | null) {
  const cursor = value?.trim();
  return cursor || undefined;
}
