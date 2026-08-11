#!/usr/bin/env -S node --experimental-strip-types

/**
 * A Cucumber run that matches no feature files exits zero. So does one whose steps fail to
 * bind, and one filtered down to nothing by a tag. All three are indistinguishable from a
 * clean pass, which is how a suite that tested nothing comes to be reported as green.
 *
 * This runner refuses that outcome: it reads the message stream Cucumber emits, counts the
 * scenarios that actually executed, and fails when that count falls below the floor even if
 * Cucumber itself was happy.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPORT = join(HERE, '.cucumber-messages.ndjson')

/**
 * Raise this as scenarios are added. It is deliberately a floor rather than an exact count,
 * so adding a scenario never fails the build, but losing one always does.
 */
const MINIMUM_SCENARIOS = 5

interface RunCounts {
  executed: number
  passed: number
  failed: number
  other: number
}

function countScenarios(reportPath: string): RunCounts {
  const counts: RunCounts = { executed: 0, passed: 0, failed: 0, other: 0 }

  if (!existsSync(reportPath)) {
    return counts
  }

  const lines = readFileSync(reportPath, 'utf8').split('\n')
  for (const line of lines) {
    if (line.trim() === '') continue

    let message: Record<string, unknown>
    try {
      message = JSON.parse(line) as Record<string, unknown>
    } catch {
      // A truncated final line means the run died mid write. Ignore the line, not the run:
      // the exit code below still reports the failure.
      continue
    }

    const finished = message.testCaseFinished as { willBeRetried?: boolean } | undefined
    if (!finished || finished.willBeRetried === true) continue

    counts.executed += 1
  }

  // Step level results carry the pass or fail verdict, so tally them separately.
  for (const line of lines) {
    if (line.trim() === '') continue
    try {
      const message = JSON.parse(line) as Record<string, unknown>
      const step = message.testStepFinished as
        | { testStepResult?: { status?: string } }
        | undefined
      const status = step?.testStepResult?.status
      if (status === 'FAILED') counts.failed += 1
      else if (status === 'PASSED') counts.passed += 1
      else if (status !== undefined) counts.other += 1
    } catch {
      continue
    }
  }

  return counts
}

/** Walk from `startDir` towards the filesystem root looking for `relativePath`. */
function findUpwards(startDir: string, relativePath: string): string | null {
  let directory = startDir

  for (;;) {
    const candidate = join(directory, relativePath)
    if (existsSync(candidate)) return candidate

    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

function main(): void {
  rmSync(REPORT, { force: true })

  // npm hoists workspace dependencies to the repository root, so walk up looking for the
  // real file rather than guessing a relative path. A wrong guess produces a run with no
  // scenarios, which is indistinguishable from having no feature files.
  const cucumberBin = findUpwards(HERE, join('node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js'))

  if (cucumberBin === null) {
    process.stderr.write(
      'FAIL: could not find @cucumber/cucumber. Run npm install at the repository root.\n',
    )
    process.exit(1)
  }

  const passthrough = process.argv.slice(2)
  // Cucumber resolves --config against its working directory, so an absolute path is
  // appended to the cwd rather than replacing it. The child runs in HERE, so keep it relative.
  const args = [cucumberBin, '--config', 'cucumber.cjs', '--format', `message:${REPORT}`, ...passthrough]

  // Step definitions are TypeScript. Cucumber spawns its own module loading, so the type
  // stripping flag has to reach it through the environment rather than this process's argv.
  const nodeOptions = [process.env.NODE_OPTIONS ?? '', '--experimental-strip-types']
    .join(' ')
    .trim()

  const cucumber = spawnSync(process.execPath, args, {
    cwd: HERE,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  })

  const counts = countScenarios(REPORT)

  process.stdout.write('\n')
  process.stdout.write(`scenarios executed: ${counts.executed}\n`)
  process.stdout.write(`steps passed: ${counts.passed}  failed: ${counts.failed}\n`)

  if (counts.executed === 0) {
    process.stderr.write(
      '\nFAIL: the run executed zero scenarios.\n' +
        'Cucumber exits zero when it matches no feature files, when step definitions fail to\n' +
        'bind, and when a tag filter selects nothing. None of those are a pass. Check that\n' +
        'acceptance/features contains .feature files and that the glob in cucumber.cjs reaches\n' +
        'them.\n',
    )
    process.exit(1)
  }

  if (counts.executed < MINIMUM_SCENARIOS) {
    process.stderr.write(
      `\nFAIL: ${counts.executed} scenarios executed, floor is ${MINIMUM_SCENARIOS}.\n` +
        'Scenarios have been lost rather than added. If the removal is deliberate, lower\n' +
        'MINIMUM_SCENARIOS in acceptance/run.ts in the same change that removes them.\n',
    )
    process.exit(1)
  }

  if (cucumber.status !== 0) {
    process.exit(cucumber.status ?? 1)
  }

  process.exit(0)
}

main()
