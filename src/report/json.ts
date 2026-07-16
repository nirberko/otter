import type { ScanReport } from "../model.js";

export function renderJson(report: ScanReport): string {
	return JSON.stringify(report, null, 2);
}
