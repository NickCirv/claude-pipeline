<div align="center">

# claude-pipeline

**Run Claude Code as every step of a YAML-defined workflow**

[![License: MIT](https://img.shields.io/badge/License-MIT-0B0A09?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Node >=18](https://img.shields.io/badge/Node-%3E%3D18-0B0A09?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

</div>

## Install

```bash
npx github:NickCirv/claude-pipeline init
```

> Requires Node 18+ and the [`claude` CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated.

## Usage

```bash
# Scaffold a pipeline in the current directory
npx github:NickCirv/claude-pipeline init

# Run it
npx github:NickCirv/claude-pipeline run pipeline.yml

# Validate syntax without running
npx github:NickCirv/claude-pipeline validate pipeline.yml

# List all pipelines in the project
npx github:NickCirv/claude-pipeline list
```

### `run` flags

| Flag | Description |
|------|-------------|
| `-d, --dry-run` | Print steps without executing |
| `-v, --verbose` | Show step output previews in real-time |
| `--json` | Output full result as JSON after execution |

## What it does

claude-pipeline lets you define multi-step Claude Code workflows in YAML — similar to GitHub Actions, but Claude is the executor of every step. Each step receives the output of all previous steps as context, so a `fix-tests` step automatically knows which tests failed. Steps support conditional execution, dependency ordering, and configurable retry counts.

```yaml
name: ci-fix
steps:
  - name: lint
    task: "Run ESLint, fix auto-fixable issues"
    on_fail: stop

  - name: test
    task: "Run the test suite"
    on_fail: continue

  - name: fix-tests
    task: "Fix any failing tests from the previous step"
    depends_on: test
    condition: failed

  - name: commit
    task: "Commit all changes with a descriptive message"
```

### Step options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Unique step identifier |
| `task` | string | required | Natural language instruction for Claude |
| `on_fail` | `stop` \| `continue` | `stop` | What to do when a step fails |
| `depends_on` | string \| string[] | — | Run after the named step(s) |
| `condition` | `always` \| `failed` \| `passed` \| `any` | `always` | When to run relative to dependency |
| `retry` | 1–5 | 1 | Attempts before marking failed |

### Included templates

Three ready-made templates live in `templates/`:

| Template | Purpose |
|----------|---------|
| `ci-fix.yml` | Lint → type-check → fix types → test → fix tests → commit |
| `pr-ready.yml` | Full pre-PR checklist: lint, test, security, coverage, docs, PR description |
| `security-scan.yml` | Dependency audit → secrets scan → OWASP check → security report |

---

<sub>Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
