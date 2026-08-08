export async function inTenantTransaction(db: any, workspaceId: string) {
  return db.transaction(async (tx: any) => {
    await tx.execute("SELECT set_config('app.workspace_id', $1, true)", [workspaceId])
    return tx.execute('SELECT * FROM resources')
  })
}
