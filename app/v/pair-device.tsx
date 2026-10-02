"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { QrScanner } from "@/components/voter/qr-scanner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rpcErrorCode } from "@/lib/rpc/errors";
import { createClient } from "@/lib/supabase/browser";
import { extractCode, isCompleteCode, normalizeCode } from "@/lib/voter/code";

const MESSAGES: Record<string, string> = {
  invalid_token: "Ce code n'est pas (ou plus) valide. Adressez-vous à l'accueil.",
  token_already_claimed: "Ce code est déjà utilisé sur un autre appareil. Adressez-vous à l'accueil.",
};

export function PairDevice() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  const claim = useCallback(
    (code: string) =>
      startTransition(async () => {
        setError(undefined);
        const supabase = createClient();
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) {
            setError("Connexion impossible. Vérifiez le réseau et réessayez.");
            return;
          }
        }
        const { error: claimError } = await supabase.rpc("claim_voter_token", {
          p_code: normalizeCode(code),
        });
        if (claimError) {
          setError(
            MESSAGES[rpcErrorCode(claimError) ?? ""] ??
              "Association impossible. Réessayez ou adressez-vous à l'accueil.",
          );
          return;
        }
        // Le code ne reste ni dans l'historique ni dans la barre d'adresse.
        window.history.replaceState(null, "", "/v");
        router.replace("/vote");
      }),
    [router],
  );

  useEffect(() => {
    const fromLink = extractCode(`/v${window.location.hash}`);
    if (fromLink) claim(fromLink);
  }, [claim]);

  const onScan = useCallback(
    (text: string) => {
      const code = extractCode(text);
      if (!code) return false;
      setScanning(false);
      claim(code);
      return true;
    },
    [claim],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Voter depuis cet appareil</h1>
        <p className="text-muted-foreground text-lg">
          Scannez le QR code remis à l&apos;accueil, ou saisissez le code inscrit dessous.
        </p>
      </div>

      {pending && <Alert role="status">Association en cours…</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}

      {scanning ? (
        <div className="flex flex-col gap-3">
          <QrScanner onResult={onScan} label="Caméra : visez le QR code" />
          <Button variant="outline" size="lg" onClick={() => setScanning(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button size="lg" className="h-14 text-lg" onClick={() => setScanning(true)} disabled={pending}>
          Scanner le QR code
        </Button>
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (isCompleteCode(manual)) claim(manual);
        }}
      >
        <Label htmlFor="code" className="text-base">
          Code (16 caractères)
        </Label>
        <Input
          id="code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="h-14 font-mono text-xl tracking-wider"
        />
        <Button
          type="submit"
          size="lg"
          className="h-14 text-lg"
          disabled={pending || !isCompleteCode(manual)}
        >
          Valider le code
        </Button>
      </form>
    </div>
  );
}
