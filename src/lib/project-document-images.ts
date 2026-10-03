const documentImageKey = /^project-documents\/([a-zA-Z0-9_-]+)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg)$/;

export function documentImageProjectId(key: string) {
  return key.match(documentImageKey)?.[1];
}

export function isDocumentImageUrl(value: string) {
  if (!value.startsWith("/api/assets?")) return false;
  const query = new URLSearchParams(value.slice("/api/assets?".length));
  return [...query.keys()].length === 1 && Boolean(documentImageProjectId(query.get("key") ?? ""));
}
