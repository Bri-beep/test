const identifierPartPattern = /^[A-Za-z0-9_-]+$/;

export function quoteQualifiedIdentifier(qualifiedName: string): string {
  const parts = qualifiedName.split(".");
  if (parts.length !== 3 || parts.some((part) => !identifierPartPattern.test(part))) {
    throw new Error("Databricks identifiers must use the catalog.schema.object format");
  }
  return parts.map((part) => `\`${part}\``).join(".");
}
