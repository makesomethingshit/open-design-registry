const keyPattern = /^project-documents\/[a-zA-Z0-9_-]+\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg)$/;

export function documentImageKeyFromUrl(value, options = {}) {
  if (!value) return undefined;
  if (keyPattern.test(value)) return value;
  const bucket = options.bucket ?? process.env.S3_BUCKET ?? "open-design-registry";
  const region = options.region ?? process.env.S3_REGION ?? "us-east-1";
  const endpoint = options.endpoint ?? process.env.S3_ENDPOINT;
  try {
    const url = new URL(value, "http://document.local");
    if (url.pathname === "/api/assets") {
      const key = url.searchParams.get("key");
      if (key) return keyPattern.test(key) ? key : undefined;
      const legacy = url.searchParams.get("url");
      return legacy ? documentImageKeyFromUrl(legacy, { bucket, region, endpoint }) : undefined;
    }
    let key;
    if (endpoint) {
      const configured = new URL(endpoint);
      if (url.origin !== configured.origin) return undefined;
      const prefix = `${configured.pathname.replace(/\/$/, "")}/${bucket}/`;
      const path = decodeURIComponent(url.pathname);
      if (!path.startsWith(prefix)) return undefined;
      key = path.slice(prefix.length);
    } else {
      if (url.hostname.toLowerCase() !== `${bucket}.s3.${region}.amazonaws.com`.toLowerCase()) return undefined;
      key = decodeURIComponent(url.pathname).replace(/^\//, "");
    }
    return keyPattern.test(key) ? key : undefined;
  } catch { return undefined; }
}

// PostgreSQL filters equivalent encodings without returning every document.
// A candidate still undergoes URL parsing before it is treated as a URL reference.
export function encodedKeyPattern(key) {
  return [...key].map((char) => `(${char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|%(25)*${char.charCodeAt(0).toString(16).padStart(2, "0")})`).join("");
}
