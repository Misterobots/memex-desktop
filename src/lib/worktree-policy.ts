export function safeWorktreeSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return !slug || slug.includes("..") ? "task" : slug.slice(0, 48);
}
