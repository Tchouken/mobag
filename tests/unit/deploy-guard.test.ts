import { describe, expect, it } from "vitest";
import { decide } from "../../scripts/deploy-guard.mjs";

const live = { deploy_freeze: true, assemblies_in_session: 1, assemblies_starting_soon: 0 };
const calm = { deploy_freeze: false, assemblies_in_session: 0, assemblies_starting_soon: 0 };

describe("gel des déploiements", () => {
  it("gèle la production pendant une AG", () => {
    expect(decide({ vercelEnv: "production", health: live, override: false }).freeze).toBe(true);
    expect(decide({ vercelEnv: null, health: live, override: false }).freeze).toBe(true);
  });
  it("ne bloque ni les prévisualisations, ni hors séance, ni sur décision explicite", () => {
    expect(decide({ vercelEnv: "preview", health: live, override: false }).freeze).toBe(false);
    expect(decide({ vercelEnv: "production", health: calm, override: false }).freeze).toBe(false);
    expect(decide({ vercelEnv: "production", health: live, override: true }).freeze).toBe(false);
  });
  it("laisse déployer si l'état de production est inconnu (correctif d'une panne)", () => {
    expect(decide({ vercelEnv: "production", health: null, override: false }).freeze).toBe(false);
  });
});
