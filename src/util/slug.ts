// Server ids contain '/', '.', '@' — turn one into a safe filename/URL segment.
export function slug(id: string): string {
	return id
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
}
