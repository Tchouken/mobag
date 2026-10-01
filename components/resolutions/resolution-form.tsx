"use client";

import { useState, useTransition } from "react";
import {
  deleteResolution,
  saveResolution,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/resolutions/actions";
import { RuleEditor, type Preset } from "@/components/assembly/rule-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ABSTENTION_LABELS,
  resolutionSchema,
  VOTE_TYPE_LABELS,
  type ResolutionInput,
} from "@/lib/domain/resolution";
import type { MajorityRule, QuorumRule } from "@/lib/domain/rules";
import type { RichTextDoc } from "@/lib/rich-text/extensions";
import { RichTextEditor } from "./rich-text-editor";

type Props = {
  orgId: string;
  assemblyId: string;
  resolutionId: string | null;
  version: number | null;
  initial: ResolutionInput;
  keys: { id: string; label: string; is_primary: boolean }[];
  parents: { id: string; number: string; title: string }[];
  majorityPresets: Preset[];
  quorumPresets: Preset[];
  assemblyQuorum: string;
  showBoardRecommendation: boolean;
  requireReason: boolean;
  disabled: boolean;
};

const DEFAULT_MAJORITY: MajorityRule = {
  conditions: [{ measure: "weight", numerator: "for", base: "expressed", num: 1, den: 2, comparison: "gt" }],
};
const DEFAULT_QUORUM: QuorumRule = { conditions: [] };

export function ResolutionForm(props: Props) {
  const { orgId, assemblyId, resolutionId, version, keys, parents, disabled, requireReason } = props;
  const [value, setValue] = useState<ResolutionInput>(props.initial);
  const [majority, setMajority] = useState<MajorityRule>(props.initial.majority_rule ?? DEFAULT_MAJORITY);
  const [ownQuorum, setOwnQuorum] = useState(props.initial.quorum_rule !== null);
  const [quorum, setQuorum] = useState<QuorumRule>(props.initial.quorum_rule ?? DEFAULT_QUORUM);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ResolutionInput>(key: K, v: ResolutionInput[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));
  const isVote = value.vote_type !== "information";

  const payload: ResolutionInput = {
    ...value,
    majority_rule: isVote ? majority : null,
    quorum_rule: isVote && ownQuorum ? quorum : null,
  };
  const check = resolutionSchema.safeParse(payload);
  const issues = check.success ? [] : [...new Set(check.error.issues.map((i) => i.message))];

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await saveResolution(orgId, assemblyId, resolutionId, version, payload, reason);
      if (result?.error) setError(result.error);
    });

  const remove = () => {
    const motive = requireReason
      ? window.prompt("Motif de la suppression (obligatoire après convocation) :")
      : "";
    if (motive === null || (requireReason && !motive.trim())) return;
    if (!requireReason && !window.confirm("Supprimer cette résolution ? Son historique est conservé."))
      return;
    startTransition(async () => {
      const result = await deleteResolution(orgId, assemblyId, resolutionId!, motive);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Texte</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={disabled} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Titre court</Label>
              <Input
                id="title"
                value={value.title}
                maxLength={300}
                required
                onChange={(e) => set("title", e.target.value)}
                placeholder="Approbation des comptes de l'exercice 2025"
              />
            </div>
            {parents.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="parent">Rattachement</Label>
                <Select
                  id="parent"
                  value={value.parent_id ?? ""}
                  onChange={(e) => set("parent_id", e.target.value || null)}
                >
                  <option value="">Résolution principale</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      Sous-résolution de {p.number}. {p.title}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label id="body-label" htmlFor="body">
                Texte intégral
              </Label>
              <RichTextEditor
                id="body"
                labelledBy="body-label"
                value={value.body as RichTextDoc}
                disabled={disabled}
                onChange={(doc) => set("body", doc)}
              />
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vote</CardTitle>
          <CardDescription>Ces paramètres sont figés à l&apos;ouverture du scrutin.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={disabled} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="vote-type">Type de vote</Label>
                <Select
                  id="vote-type"
                  value={value.vote_type}
                  onChange={(e) => set("vote_type", e.target.value as ResolutionInput["vote_type"])}
                >
                  <option value="yes_no_abstain">{VOTE_TYPE_LABELS.yes_no_abstain}</option>
                  <option value="information">{VOTE_TYPE_LABELS.information}</option>
                  <option value="multiple_choice" disabled>
                    {VOTE_TYPE_LABELS.multiple_choice} (bientôt)
                  </option>
                  <option value="election" disabled>
                    {VOTE_TYPE_LABELS.election} (bientôt)
                  </option>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="weight-key">Clé de répartition</Label>
                <Select
                  id="weight-key"
                  value={value.weight_key_id}
                  onChange={(e) => set("weight_key_id", e.target.value)}
                >
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                      {k.is_primary ? " (principale)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {isVote && (
              <>
                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">Règle de majorité</h3>
                  <RuleEditor
                    kind="majority"
                    idPrefix="majority"
                    value={majority}
                    onChange={setMajority}
                    presets={props.majorityPresets}
                    disabled={disabled}
                    onPresetSelect={(p) =>
                      p.abstention_policy &&
                      set("abstention_policy", p.abstention_policy as ResolutionInput["abstention_policy"])
                    }
                  />
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="abstention">Abstentions</Label>
                    <Select
                      id="abstention"
                      value={value.abstention_policy}
                      onChange={(e) =>
                        set("abstention_policy", e.target.value as ResolutionInput["abstention_policy"])
                      }
                    >
                      <option value="excluded">{ABSTENTION_LABELS.excluded}</option>
                      <option value="included">{ABSTENTION_LABELS.included}</option>
                    </Select>
                  </div>
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">Quorum</h3>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={ownQuorum}
                      onChange={(e) => setOwnQuorum(e.target.checked)}
                    />
                    <span>
                      Quorum propre à cette résolution
                      <span className="text-muted-foreground block text-sm">
                        Sinon : quorum de l&apos;assemblée ({props.assemblyQuorum}).
                      </span>
                    </span>
                  </label>
                  {ownQuorum && (
                    <RuleEditor
                      kind="quorum"
                      idPrefix="quorum"
                      value={quorum}
                      onChange={setQuorum}
                      presets={props.quorumPresets}
                      disabled={disabled}
                    />
                  )}
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={value.is_secret}
                      onChange={(e) => set("is_secret", e.target.checked)}
                    />
                    <span>
                      Vote à bulletin secret
                      <span className="text-muted-foreground block text-sm">
                        Aucun détail nominatif n&apos;est affiché ni exporté.
                      </span>
                    </span>
                  </label>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="vote-change">Modification du vote pendant le scrutin</Label>
                    <Select
                      id="vote-change"
                      value={value.allow_vote_change === null ? "" : String(value.allow_vote_change)}
                      onChange={(e) =>
                        set("allow_vote_change", e.target.value === "" ? null : e.target.value === "true")
                      }
                    >
                      <option value="">Selon le réglage de l&apos;assemblée</option>
                      <option value="true">Autorisée</option>
                      <option value="false">Interdite</option>
                    </Select>
                  </div>
                </div>

                {props.showBoardRecommendation && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="board">Avis du conseil (vote des pouvoirs en blanc)</Label>
                    <Select
                      id="board"
                      value={value.board_recommendation ?? ""}
                      onChange={(e) =>
                        set(
                          "board_recommendation",
                          (e.target.value || null) as ResolutionInput["board_recommendation"],
                        )
                      }
                    >
                      <option value="">Non renseigné</option>
                      <option value="for">Projet agréé par le conseil : pouvoirs en blanc « pour »</option>
                      <option value="against">Projet non agréé : pouvoirs en blanc « contre »</option>
                    </Select>
                  </div>
                )}
              </>
            )}
          </fieldset>
        </CardContent>
      </Card>

      {requireReason && !disabled && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">Motif de la modification</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            required
            placeholder="L'assemblée est convoquée : la modification sera historisée avec ce motif"
          />
        </div>
      )}

      {issues.length > 0 && (
        <Alert variant="destructive">
          <ul className="list-inside list-disc">
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || issues.length > 0 || (requireReason && !reason.trim())}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {resolutionId && (
            <Button type="button" variant="outline" disabled={pending} onClick={remove}>
              Supprimer
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
