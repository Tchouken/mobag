const weightFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });

// Voix : jusqu'à 6 décimales, séparateurs français.
export function formatWeight(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return weightFormat.format(Number(value));
}

// Caractères réservés de la syntaxe de filtre PostgREST retirés d'une recherche libre.
export function sanitizeSearch(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/[,()%*\\:"]/g, " ")
    .trim()
    .slice(0, 100);
}
