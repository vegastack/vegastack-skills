CREATE TABLE resources (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
CREATE POLICY resources_tenant ON resources
  USING (workspace_id = current_setting('app.workspace_id')::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid);
