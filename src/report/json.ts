import { evaluateFrameworks } from "../frameworks.js";
import type { ScanReport } from "../model.js";

// Stored ScanReport stays untouched (schemaVersion 1); framework compliance is
// derived at output time so mapping changes never require a re-scan.
export function renderJson(report: ScanReport): string {
	const frameworks = evaluateFrameworks(report.findings).map((r) => ({
		id: r.framework.id,
		name: r.framework.name,
		version: r.framework.version,
		passed: r.passed,
		failed: r.failed,
		notAssessed: r.notAssessed,
		controls: r.controls.map((c) => ({
			code: c.code,
			name: c.name,
			status: c.status,
			failingFindings: c.failing.map((f) => f.id),
		})),
	}));
	return JSON.stringify({ ...report, frameworks }, null, 2);
}
