import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { resolve, basename, extname } from 'path'
import { parsePipeline, validatePipeline } from './parser.js'
import { runPipeline } from './runner.js'
import { printReport, serializeResult } from './reporter.js'

const SAMPLE_PIPELINE = `name: my-pipeline
steps:
  - name: lint
    task: "Run ESLint on the project, fix any auto-fixable issues, and report what was changed"
    on_fail: stop

  - name: test
    task: "Run the test suite and report which tests pass or fail"
    on_fail: continue

  - name: fix-tests
    task: "Fix any failing tests identified in the previous step"
    depends_on: test
    condition: failed

  - name: commit
    task: "Commit all changes with a clear, descriptive commit message"
    condition: always
`

export function createCLI() {
  const program = new Command()

  program
    .name('claude-pipeline')
    .description('Chain Claude Code tasks into YAML-defined pipelines')
    .version(
      JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
    )

  // ─── run ───────────────────────────────────────────────────────────────────
  program
    .command('run <file>')
    .description('Execute a pipeline file')
    .option('-d, --dry-run', 'Print steps without executing them')
    .option('-v, --verbose', 'Show step output previews in real-time')
    .option('--json', 'Output result as JSON to stdout after execution')
    .action(async (file, opts) => {
      const filePath = resolve(process.cwd(), file)

      let doc
      try {
        doc = parsePipeline(filePath)
      } catch (err) {
        console.error(chalk.red(`  Error: ${err.message}`))
        process.exit(1)
      }

      const { valid, errors } = validatePipeline(doc)
      if (!valid) {
        console.error(chalk.red('  Pipeline validation failed:'))
        errors.forEach((e) => console.error(chalk.red(`    • ${e}`)))
        process.exit(1)
      }

      const result = await runPipeline(doc, {
        dryRun: opts.dryRun,
        verbose: opts.verbose,
      })

      printReport(result)

      if (opts.json) {
        console.log(JSON.stringify(serializeResult(result), null, 2))
      }

      if (!result.success) process.exit(1)
    })

  // ─── init ──────────────────────────────────────────────────────────────────
  program
    .command('init [name]')
    .description('Create a sample pipeline.yml in the current directory')
    .action((name) => {
      const outFile = resolve(process.cwd(), 'pipeline.yml')

      if (existsSync(outFile)) {
        console.error(chalk.red(`  Error: pipeline.yml already exists. Remove it first or use a different name.`))
        process.exit(1)
      }

      let content = SAMPLE_PIPELINE
      if (name) {
        content = content.replace('name: my-pipeline', `name: ${name}`)
      }

      writeFileSync(outFile, content, 'utf8')
      console.log(chalk.green('  Created:') + ' pipeline.yml')
      console.log(chalk.dim('  Edit the tasks, then run: npx claude-pipeline run pipeline.yml'))
    })

  // ─── validate ──────────────────────────────────────────────────────────────
  program
    .command('validate <file>')
    .description('Check pipeline YAML syntax and structure')
    .action((file) => {
      const filePath = resolve(process.cwd(), file)

      let doc
      try {
        doc = parsePipeline(filePath)
      } catch (err) {
        console.error(chalk.red(`  Error: ${err.message}`))
        process.exit(1)
      }

      const { valid, errors } = validatePipeline(doc)

      if (valid) {
        const stepCount = doc.steps?.length ?? 0
        console.log(chalk.green(`  ✓ Valid pipeline`) + chalk.dim(` — "${doc.name}", ${stepCount} step${stepCount !== 1 ? 's' : ''}`))
      } else {
        console.error(chalk.red(`  ✗ Invalid pipeline: ${file}`))
        errors.forEach((e) => console.error(chalk.red(`    • ${e}`)))
        process.exit(1)
      }
    })

  // ─── list ──────────────────────────────────────────────────────────────────
  program
    .command('list')
    .description('List pipelines in .claude-pipelines/ and the current directory')
    .action(() => {
      const searchDirs = [
        resolve(process.cwd(), '.claude-pipelines'),
        process.cwd(),
      ]

      const found = []

      for (const dir of searchDirs) {
        if (!existsSync(dir)) continue

        try {
          const files = readdirSync(dir).filter(
            (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && f !== 'pipeline.yml'
          )

          // Also pick up pipeline.yml in cwd
          if (dir === process.cwd() && existsSync(resolve(dir, 'pipeline.yml'))) {
            files.unshift('pipeline.yml')
          }

          for (const file of files) {
            const filePath = resolve(dir, file)
            try {
              const doc = parsePipeline(filePath)
              const { valid } = validatePipeline(doc)
              found.push({
                file: filePath.replace(process.cwd() + '/', ''),
                name: doc.name || '(unnamed)',
                steps: doc.steps?.length ?? 0,
                valid,
              })
            } catch {
              found.push({
                file: filePath.replace(process.cwd() + '/', ''),
                name: '(parse error)',
                steps: 0,
                valid: false,
              })
            }
          }
        } catch {
          // Dir not readable
        }
      }

      if (found.length === 0) {
        console.log(chalk.dim('  No pipelines found.'))
        console.log(chalk.dim('  Run "claude-pipeline init" to create one.'))
        return
      }

      console.log()
      console.log(chalk.bold('  Pipelines'))
      console.log(chalk.dim('  ' + '─'.repeat(52)))

      for (const p of found) {
        const badge = p.valid ? chalk.green('✓') : chalk.red('✗')
        const steps = chalk.dim(`${p.steps} step${p.steps !== 1 ? 's' : ''}`)
        console.log(`  ${badge} ${chalk.bold(p.name).padEnd(28)} ${steps}`)
        console.log(chalk.dim(`      ${p.file}`))
      }

      console.log()
    })

  return program
}
