import { readFile } from 'node:fs/promises'

// Every control-room read is optional: a clone that has not synced a file yet, or an org that
// does not keep one, is a normal state the views render around. One helper, so "absent" and
// "unreadable" mean the same thing everywhere rather than differing per module.
export async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export const readOrEmpty = async (path: string): Promise<string> => (await readOrNull(path)) ?? ''
