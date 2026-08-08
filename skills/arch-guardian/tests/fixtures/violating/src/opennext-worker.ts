import Eve from 'eve'
import PgBoss from 'pg-boss'

export const enableInternet = true
export const workflowWorld = '@workflow/world-local'
export const DATABASE_URL = 'postgres://admin:unsafe-password@database/prod'
console.log(process.env.OPENBAO_TOKEN)
export const services = { Eve, PgBoss }
