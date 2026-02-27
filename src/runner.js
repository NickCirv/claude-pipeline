import { execFileSync } from 'child_process'
import chalk from 'chalk'

/**
 * Resolve execution order from steps, respecting depends_on.
 * Returns steps in topological order.
 * @param {Step[]} steps
 * @returns {Step[]}
 */
export function resolveExecutionOrder(steps) {
  const byName = new Map(steps.map((s) => [s.name, s]))
  const visited = new Set()
  const resolved = []

  function visit(step, chain = new Set()) {
    if (visited.has(step.name)) return

    if (chain.has(step.name)) {
      throw new Error(
        `Circular dependency detected: ${[...chain, step.name].join(' → ')}`
      )
    }

    const deps = step.depends_on
      ? Array.isArray(step.depends_on)
        ? step.depends_on
        : [step.depends_on]
      : []

    chain.add(step.name)
    for (const dep of deps) {
      const depStep = byName.get(dep)
      if (!depStep) throw new Error(`Unknown dependency: "${dep}"`)
      visit(depStep, new Set(chain))
    }

    visited.add(step.name)
    resolved.push(step)
  }

  for (const step of steps) {
    visit(step)
  }

  return resolved
}

/**
 * Run a single Claude Code task via the claude CLI.
 * Returns { success, output, duration }
 */
function runClaudeTask(task, context = '') {
  const prompt = context
    ? `CONTEXT FROM PREVIOUS STEPS:\n${context}\n\nTASK:\n${task}`
    : task

  const start = Date.now()

  try {
    const output = execFileSync('claude', ['-p', '--dangerously-skip-permissions', prompt], {
      encoding: 'utf8',
      timeout: 10 * 60 * 1000, // 10 minutes per step
      maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
    })

    return {
      success: true,
      output: output.trim(),
      duration: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.trim() || err.message,
      duration: Date.now() - start,
    }
  }
}

/**
 * Determine whether a step should run given the condition and prior step result.
 */
function shouldRunStep(step, previousFailed) {
  const condition = step.condition || 'always'

  if (condition === 'always') return true
  if (condition === 'any') return true
  if (condition === 'failed') return previousFailed
  if (condition === 'passed') return !previousFailed

  return true
}

/**
 * Execute a full pipeline.
 * @param {{ name: string, steps: Step[] }} pipeline
 * @param {{ dryRun?: boolean, verbose?: boolean }} opts
 * @returns {PipelineResult}
 */
export async function runPipeline(pipeline, opts = {}) {
  const { dryRun = false, verbose = false } = opts
  const startTime = Date.now()

  let orderedSteps
  try {
    orderedSteps = resolveExecutionOrder(pipeline.steps)
  } catch (err) {
    return {
      name: pipeline.name,
      success: false,
      error: err.message,
      steps: [],
      duration: 0,
    }
  }

  const stepResults = []
  let accumulatedContext = ''
  let pipelineFailed = false

  console.log(chalk.bold.cyan(`\n  Pipeline: ${pipeline.name}`))
  console.log(chalk.dim(`  ${orderedSteps.length} step${orderedSteps.length !== 1 ? 's' : ''}\n`))

  for (const step of orderedSteps) {
    const previousFailed = stepResults.length > 0
      ? !stepResults[stepResults.length - 1].success
      : false

    if (!shouldRunStep(step, previousFailed)) {
      const skippedResult = {
        name: step.name,
        status: 'skipped',
        success: true,
        output: '',
        duration: 0,
      }
      stepResults.push(skippedResult)
      console.log(chalk.dim(`  ⊘ ${step.name} [skipped — condition not met]`))
      continue
    }

    console.log(chalk.bold(`  ▸ ${step.name}`))

    if (dryRun) {
      const dryResult = {
        name: step.name,
        status: 'dry-run',
        success: true,
        output: `[DRY RUN] Would execute: ${step.task.slice(0, 80)}${step.task.length > 80 ? '…' : ''}`,
        duration: 0,
      }
      stepResults.push(dryResult)
      console.log(chalk.dim(`    ${dryResult.output}`))
      continue
    }

    const maxRetries = step.retry || 1
    let attempt = 0
    let result

    while (attempt < maxRetries) {
      if (attempt > 0) {
        console.log(chalk.yellow(`    Retry ${attempt}/${maxRetries - 1}…`))
      }

      result = runClaudeTask(step.task, accumulatedContext)
      attempt++

      if (result.success || attempt >= maxRetries) break
    }

    const duration = `${(result.duration / 1000).toFixed(1)}s`

    if (result.success) {
      console.log(chalk.green(`    ✓ passed`) + chalk.dim(` [${duration}]`))

      if (verbose && result.output) {
        const preview = result.output.split('\n').slice(0, 6).join('\n')
        console.log(chalk.dim(`\n${preview.split('\n').map(l => '      ' + l).join('\n')}\n`))
      }

      accumulatedContext += `\n--- Step "${step.name}" output ---\n${result.output}\n`

      stepResults.push({
        name: step.name,
        status: 'passed',
        success: true,
        output: result.output,
        duration: result.duration,
      })
    } else {
      const onFail = step.on_fail || 'stop'
      console.log(chalk.red(`    ✗ failed`) + chalk.dim(` [${duration}] — on_fail: ${onFail}`))

      if (verbose && result.output) {
        const preview = result.output.split('\n').slice(0, 6).join('\n')
        console.log(chalk.dim(`\n${preview.split('\n').map(l => '      ' + l).join('\n')}\n`))
      }

      stepResults.push({
        name: step.name,
        status: 'failed',
        success: false,
        output: result.output,
        duration: result.duration,
      })

      accumulatedContext += `\n--- Step "${step.name}" FAILED ---\n${result.output}\n`

      if (onFail === 'stop') {
        pipelineFailed = true
        break
      }

      // continue or retry already handled above
      pipelineFailed = true
    }
  }

  return {
    name: pipeline.name,
    success: !pipelineFailed,
    steps: stepResults,
    duration: Date.now() - startTime,
  }
}
