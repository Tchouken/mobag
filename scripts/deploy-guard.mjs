// Gel des déploiements le jour d'une AG (SPEC §7.2).
//
// · Vercel (« Ignored Build Step », vercel.json) : code de sortie 0 = ne pas construire,
//   1 = construire. En production, la construction est sautée tant qu'une AG est en séance ou
//   commence dans les 12 heures. Les prévisualisations ne sont jamais bloquées.
// · GitHub (contrôle de PR, --check) : code de sortie 1 = AG en cours, fusion à différer.
//
// Variables : PRODUCTION_HEALTH_URL (ex. https://vote.mobilactif.fr/api/health),
// DEPLOY_FREEZE_OVERRIDE=1 pour passer outre (correctif urgent, décision tracée).
import { pathToFileURL } from "node:url";

export function decide({ vercelEnv, health, override }) {
  if (vercelEnv && vercelEnv !== "production")
    return { freeze: false, reason: "prévisualisation : jamais bloquée" };
  if (override) return { freeze: false, reason: "gel levé manuellement (DEPLOY_FREEZE_OVERRIDE=1)" };
  if (!health) return { freeze: false, reason: "état de production inconnu : déploiement autorisé" };
  if (health.deploy_freeze) {
    return {
      freeze: true,
      reason: `AG en cours (${health.assemblies_in_session} en séance, ${health.assemblies_starting_soon} imminente(s)) : déploiement de production gelé`,
    };
  }
  return { freeze: false, reason: "aucune AG en cours" };
}

async function main() {
  const check = process.argv.includes("--check");
  const url = process.env.PRODUCTION_HEALTH_URL;
  let health = null;
  if (url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) health = await response.json();
    } catch {
      health = null;
    }
  }
  const { freeze, reason } = decide({
    vercelEnv: check ? null : process.env.VERCEL_ENV,
    health,
    override: process.env.DEPLOY_FREEZE_OVERRIDE === "1",
  });
  console.log(`Gel des déploiements : ${reason}`);
  if (check) process.exit(freeze ? 1 : 0);
  process.exit(freeze ? 0 : 1); // Vercel : 0 = sauter la construction
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
