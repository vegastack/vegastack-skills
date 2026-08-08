CREATE TABLE resources (id uuid PRIMARY KEY, workspace_id uuid NOT NULL);
CREATE TABLE agent_approvals (id uuid PRIMARY KEY, continuation jsonb);
ALTER ROLE web_user BYPASSRLS;
