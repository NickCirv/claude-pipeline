import { readFileSync } from 'fs'
import { load } from 'js-yaml'

const VALID_ON_FAIL = new Set(['stop', 'continue', 'retry'])
const VALID_CONDITIONS = new Set(['always', 'failed', 'passed', 'any'])

/**
 * Load and parse a pipeline YAML file.
 * @param {string} filePath - Absolute or relative path to the YAML file.
 * @returns {{ name: string, steps: Step[] }}
 */
export function parsePipeline(filePath) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read pipeline file: ${filePath}\n${err.message}`)
  }

  let doc
  try {
    doc = load(raw)
  } catch (err) {
    throw new Error(`Invalid YAML in ${filePath}: ${err.message}`)
  }

  if (!doc || typeof doc !== 'object') {
    throw new Error(`Pipeline file is empty or not a YAML object: ${filePath}`)
  }

  return doc
}

/**
 * Validate a parsed pipeline document.
 * Returns { valid: boolean, errors: string[] }
 */
export function validatePipeline(doc) {
  const errors = []

  if (!doc.name || typeof doc.name !== 'string') {
    errors.push('Pipeline must have a string "name" field')
  }

  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    errors.push('Pipeline must have a non-empty "steps" array')
    return { valid: false, errors }
  }

  const stepNames = new Set()

  doc.steps.forEach((step, i) => {
    const prefix = `Step[${i}]${step.name ? ` "${step.name}"` : ''}`

    if (!step.name || typeof step.name !== 'string') {
      errors.push(`${prefix}: missing or invalid "name" field`)
    } else if (stepNames.has(step.name)) {
      errors.push(`Step "${step.name}": duplicate step name`)
    } else {
      stepNames.add(step.name)
    }

    if (!step.task || typeof step.task !== 'string') {
      errors.push(`${prefix}: missing or invalid "task" field`)
    }

    if (step.on_fail !== undefined && !VALID_ON_FAIL.has(step.on_fail)) {
      errors.push(
        `${prefix}: invalid "on_fail" value "${step.on_fail}". Must be one of: ${[...VALID_ON_FAIL].join(', ')}`
      )
    }

    if (step.condition !== undefined && !VALID_CONDITIONS.has(step.condition)) {
      errors.push(
        `${prefix}: invalid "condition" value "${step.condition}". Must be one of: ${[...VALID_CONDITIONS].join(', ')}`
      )
    }

    if (step.depends_on !== undefined) {
      const deps = Array.isArray(step.depends_on)
        ? step.depends_on
        : [step.depends_on]

      deps.forEach((dep) => {
        if (typeof dep !== 'string') {
          errors.push(`${prefix}: "depends_on" must be a string or array of strings`)
        }
      })
    }

    if (step.retry !== undefined) {
      if (
        typeof step.retry !== 'number' ||
        !Number.isInteger(step.retry) ||
        step.retry < 1 ||
        step.retry > 5
      ) {
        errors.push(`${prefix}: "retry" must be an integer between 1 and 5`)
      }
    }
  })

  // Validate dependency references exist
  doc.steps.forEach((step) => {
    if (!step.depends_on) return
    const deps = Array.isArray(step.depends_on)
      ? step.depends_on
      : [step.depends_on]

    deps.forEach((dep) => {
      if (!stepNames.has(dep)) {
        errors.push(
          `Step "${step.name}": depends_on references unknown step "${dep}"`
        )
      }
    })
  })

  return { valid: errors.length === 0, errors }
}
