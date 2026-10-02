"use client";

import { createContext, useContext } from "react";
import type { ReceptionSnapshot } from "@/lib/reception/model";
import { parseViolations, type Violation } from "@/lib/proxies";
import { rpcErrorCode, rpcErrorMessage } from "@/lib/rpc/errors";
import type { createClient } from "@/lib/supabase/browser";

export type ReceptionContextValue = {
  supabase: ReturnType<typeof createClient>;
  assemblyId: string;
  isBureau: boolean;
  snapshot: ReceptionSnapshot;
  refresh: () => Promise<void>;
  select: (key: string | null) => void;
};

export const ReceptionContext = createContext<ReceptionContextValue | null>(null);

export function useReception(): ReceptionContextValue {
  const value = useContext(ReceptionContext);
  if (!value) throw new Error("ReceptionContext manquant");
  return value;
}

export type Failure = { message: string; violations: Violation[] };

// Erreur d'une RPC de l'accueil, traduite. Un conflit de version signifie qu'un autre poste
// vient de traiter la même personne : l'écran se recharge avant toute nouvelle tentative.
export function failure(
  error: { message?: string | null; code?: string | null; details?: string | null } | null,
): Failure {
  const code = rpcErrorCode(error);
  if (code === "version_conflict") {
    return {
      message:
        "Cette fiche vient d'être modifiée sur un autre poste. Vérifiez sa situation puis recommencez.",
      violations: [],
    };
  }
  return {
    message: rpcErrorMessage(error),
    violations: code === "proxy_rule_violation" ? parseViolations(error?.details) : [],
  };
}
