import type { Category, Finding, Severity } from './model.js'

const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
  info: 0,
}

// Repeated findings in the same category decay: 1, 0.5, 0.25, ... capped.
const DECAY = [1, 0.5, 0.25, 0.125, 0.0625]

function decayFactor(index: number): number {
  return DECAY[Math.min(index, DECAY.length - 1)]
}

export interface Scored {
  score: number
  breakdown: Partial<Record<Category, number>>
}

export function scoreFindings(findings: Finding[]): Scored {
  const byCategory = new Map<Category, Finding[]>()
  for (const f of findings) {
    const list = byCategory.get(f.category) ?? []
    list.push(f)
    byCategory.set(f.category, list)
  }

  const breakdown: Partial<Record<Category, number>> = {}
  let totalPenalty = 0

  for (const [category, list] of byCategory) {
    // Heaviest findings first so decay rewards the worst, not the noisiest.
    const sorted = [...list].sort(
      (a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity],
    )
    let categoryPenalty = 0
    sorted.forEach((f, i) => {
      categoryPenalty += SEVERITY_PENALTY[f.severity] * decayFactor(i)
    })
    breakdown[category] = Math.round(categoryPenalty)
    totalPenalty += categoryPenalty
  }

  let score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)))

  // A single confirmed critical means "do not install" regardless of arithmetic.
  if (findings.some((f) => f.severity === 'critical')) {
    score = Math.min(score, 40)
  }

  return { score, breakdown }
}

export function scoreBand(score: number): 'verified' | 'ok' | 'warn' | 'danger' {
  if (score >= 90) return 'verified'
  if (score >= 70) return 'ok'
  if (score >= 50) return 'warn'
  return 'danger'
}
