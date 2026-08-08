function pointer(root, reference) {
  if (!reference.startsWith('#/')) throw new Error(`Only local JSON Schema references are supported: ${reference}`)
  return reference.slice(2).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root)
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const typeOf = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
const joinPath = (base, key) => `${base}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function validateJsonSchema(schema, value) {
  const errors = []
  function validate(node, data, path = '$', quiet = false) {
    const local = []
    const add = message => local.push(`${path}: ${message}`)
    if (node.$ref) return validate(pointer(schema, node.$ref), data, path, quiet)
    if (node.const !== undefined && !same(data, node.const)) add(`must equal ${JSON.stringify(node.const)}`)
    if (node.enum && !node.enum.some(item => same(item, data))) add(`must be one of ${node.enum.map(item => JSON.stringify(item)).join(', ')}`)
    if (node.type) {
      const allowed = Array.isArray(node.type) ? node.type : [node.type]
      if (!allowed.includes(typeOf(data)) || (typeOf(data) === 'number' && !Number.isFinite(data))) add(`must be ${allowed.join(' or ')}`)
    }
    if (typeof data === 'string') {
      if (node.minLength !== undefined && data.length < node.minLength) add(`must have length >= ${node.minLength}`)
      if (node.pattern && !new RegExp(node.pattern).test(data)) add(`must match ${node.pattern}`)
      if (node.format === 'date' && !validDate(data)) add('must be a real ISO calendar date (YYYY-MM-DD)')
    }
    if (typeof data === 'number' && node.minimum !== undefined && data < node.minimum) add(`must be >= ${node.minimum}`)
    if (Array.isArray(data)) {
      if (node.minItems !== undefined && data.length < node.minItems) add(`must contain at least ${node.minItems} item(s)`)
      if (node.uniqueItems && new Set(data.map(item => JSON.stringify(item))).size !== data.length) add('must contain unique items')
      if (node.items) data.forEach((item, index) => local.push(...validate(node.items, item, joinPath(path, index), true)))
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const keys = Object.keys(data)
      if (node.minProperties !== undefined && keys.length < node.minProperties) add(`must contain at least ${node.minProperties} properties`)
      for (const required of node.required ?? []) if (!(required in data)) local.push(`${joinPath(path, required)}: is required`)
      for (const [key, child] of Object.entries(node.properties ?? {})) if (key in data) local.push(...validate(child, data[key], joinPath(path, key), true))
      if (node.propertyNames) for (const key of keys) local.push(...validate(node.propertyNames, key, `${path} property ${JSON.stringify(key)}`, true))
      const known = new Set(Object.keys(node.properties ?? {}))
      for (const key of keys.filter(key => !known.has(key))) {
        if (node.additionalProperties === false) local.push(`${joinPath(path, key)}: additional property is not allowed`)
        else if (node.additionalProperties && typeof node.additionalProperties === 'object') local.push(...validate(node.additionalProperties, data[key], joinPath(path, key), true))
      }
    }
    for (const child of node.allOf ?? []) local.push(...validate(child, data, path, true))
    if (node.oneOf) {
      const matches = node.oneOf.map(child => validate(child, data, path, true)).filter(result => result.length === 0).length
      if (matches !== 1) add(`must match exactly one schema branch (matched ${matches})`)
    }
    if (node.not && validate(node.not, data, path, true).length === 0) add('must not match forbidden schema')
    if (node.if && validate(node.if, data, path, true).length === 0 && node.then) local.push(...validate(node.then, data, path, true))
    if (!quiet) errors.push(...local)
    return local
  }
  validate(schema, value)
  return errors
}
