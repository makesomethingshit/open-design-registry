import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { expect, test } from "@playwright/test";

test("an expired draft image keeps the editor open and can be replaced before saving", async ({ page }) => {
  test.skip(!process.env.E2E_INTEGRATION, "requires isolated PostgreSQL and S3");
  const suffix = randomUUID();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name: "Draft owner", email: `draft-${suffix}@example.test`, password: "integration-password-123" } })).ok()).toBe(true);
  const created = await page.request.post("/api/projects", { multipart: { title: `Draft ${suffix}`, description: "Draft recovery", license: "MIT", isPublic: "true", rightsConfirmed: "on", cover: { name: "cover.png", mimeType: "image/png", buffer: png } } });
  expect(created.status()).toBe(201);
  const slug = (await created.json()).slug;
  await page.goto(`/projects/${slug}`);
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  const editor = page.locator("#project-document");
  const source = editor.getByLabel("Project document (Markdown)");
  await source.fill("# Preserve my draft\n\n");
  await source.press("Control+End");
  await editor.locator('input[type="file"]').setInputFiles({ name: "draft.png", mimeType: "image/png", buffer: png });
  await expect(source).toHaveValue(/!\[draft\]\(/);
  const draft = await source.inputValue();
  const key = new URL(draft.match(/!\[draft\]\(([^)]+)\)/)![1], "http://local").searchParams.get("key")!;
  const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin" } });
  try {
    // Simulates the result of the separately tested aged-object cleanup.
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET ?? "open-design-registry", Key: key }));
    await editor.getByRole("button", { name: "Save document", exact: true }).click();
    await expect(editor.getByRole("alert")).toHaveText("An image has expired. Upload it again before saving.");
    await expect(source).toHaveValue(draft);
    expect((await (await page.request.get(`/api/projects/${slug}`)).json()).document).toBe("");
    await editor.getByRole("button", { name: "Remove image 1", exact: true }).click();
    await editor.locator('input[type="file"]').setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
    await expect(source).toHaveValue(/!\[replacement\]\(/);
    await editor.getByRole("button", { name: "Save document", exact: true }).click();
    await expect(editor.getByText("Project document saved.", { exact: true })).toBeVisible();
    await expect(editor.getByRole("heading", { name: "Preserve my draft" })).toBeVisible();
  } finally { client.destroy(); }
});
