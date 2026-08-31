ALTER TABLE "Preview"
  ADD CONSTRAINT "Preview_mime_type_check"
  CHECK ("mimeType" IN ('image/png', 'image/jpeg', 'text/html'));
