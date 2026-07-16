// Single source of truth for scanner versioning.
export const SCANNER_VERSION = '0.1.0'

// Bump whenever detection rules/checks change (a rule in src/rules/*, a scanner,
// or scoring). A stored result whose checks version differs from this is
// "outdated" — its score predates the current checks and a re-scan is queued.
export const CHECKS_VERSION = 1
