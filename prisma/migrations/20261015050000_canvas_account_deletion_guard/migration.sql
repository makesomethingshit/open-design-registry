-- Account deletion must not indirectly erase other contributors' public history.
CREATE FUNCTION "guard_canvas_project_account_deletion"() RETURNS trigger AS $$
BEGIN
  PERFORM id FROM "Project" WHERE "ownerId" = OLD.id ORDER BY id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM "Project" p JOIN "ProjectCanvas" c ON c."projectId" = p.id
    WHERE p."ownerId" = OLD.id AND c."firstApprovedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Transfer Project ownership before deleting an account with approved Canvas history' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "guard_canvas_project_account_deletion"
BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION "guard_canvas_project_account_deletion"();
