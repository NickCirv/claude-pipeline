import chalk from 'chalk'

/**
 * Print a formatted pipeline execution report to stdout.
 * @param {PipelineResult} result
 */
export function printReport(result) {
  const totalDuration = (result.duration / 1000).toFixed(1)
  const passed = result.steps.filter((s) => s.status === 'passed').length
  const failed = result.steps.filter((s) => s.status === 'failed').length
  const skipped = result.steps.filter((s) => s.status === 'skipped').length
  const dryRun = result.steps.filter((s) => s.status === 'dry-run').length

  console.log('\n' + chalk.dim('  ' + '─'.repeat(52)))
  console.log(chalk.bold(`  Pipeline Report: ${result.name}`))
  console.log(chalk.dim('  ' + '─'.repeat(52)))

  for (const step of result.steps) {
    const duration = step.duration > 0
      ? chalk.dim(` [${(step.duration / 1000).toFixed(1)}s]`)
      : ''

    let icon
    let label

    switch (step.status) {
      case 'passed':
        icon = chalk.green('✓')
        label = chalk.green('passed')
        break
      case 'failed':
        icon = chalk.red('✗')
        label = chalk.red('failed')
        break
      case 'skipped':
        icon = chalk.dim('⊘')
        label = chalk.dim('skipped')
        break
      case 'dry-run':
        icon = chalk.yellow('○')
        label = chalk.yellow('dry-run')
        break
      default:
        icon = chalk.dim('?')
        label = chalk.dim(step.status)
    }

    console.log(`  ${icon} ${step.name.padEnd(28)} ${label}${duration}`)
  }

  console.log(chalk.dim('  ' + '─'.repeat(52)))

  const summary = [
    passed > 0 ? chalk.green(`${passed} passed`) : null,
    failed > 0 ? chalk.red(`${failed} failed`) : null,
    skipped > 0 ? chalk.dim(`${skipped} skipped`) : null,
    dryRun > 0 ? chalk.yellow(`${dryRun} dry-run`) : null,
  ]
    .filter(Boolean)
    .join(chalk.dim(', '))

  const statusBadge = result.success
    ? chalk.bgGreen.black(' PASS ')
    : chalk.bgRed.white(' FAIL ')

  console.log(`  ${statusBadge}  ${summary}  ${chalk.dim(totalDuration + 's total')}`)
  console.log()
}

/**
 * Serialize a result to a plain JSON-compatible object (for --json flag or file output).
 */
export function serializeResult(result) {
  return {
    name: result.name,
    success: result.success,
    duration: result.duration,
    steps: result.steps.map((s) => ({
      name: s.name,
      status: s.status,
      success: s.success,
      duration: s.duration,
      output: s.output,
    })),
  }
}
