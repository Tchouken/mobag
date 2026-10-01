"use client";

import { useActionState, useState } from "react";
import { updateRules, type ActionState } from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  proxyRulesSchema,
  quorumRuleSchema,
  settingsSchema,
  type AssemblySettings,
  type ProxyRules,
  type QuorumRule,
} from "@/lib/domain/rules";
import { PresetSelect, RuleEditor, type Preset } from "./rule-editor";

type Props = {
  orgId: string;
  assemblyId: string;
  version: number;
  initial: { quorum: QuorumRule; proxy: ProxyRules; settings: AssemblySettings };
  quorumPresets: Preset[];
  proxyPresets: Preset[];
  disabled: boolean;
};

function Checkbox({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
    </div>
  );
}

const optionalInt = (raw: string): number | null => (raw.trim() === "" ? null : Number(raw));

export function RulesForm({
  orgId,
  assemblyId,
  version,
  initial,
  quorumPresets,
  proxyPresets,
  disabled,
}: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateRules.bind(null, orgId, assemblyId),
    {},
  );
  const [quorum, setQuorum] = useState(initial.quorum);
  const [proxy, setProxy] = useState(initial.proxy);
  const [settings, setSettings] = useState(initial.settings);

  // Toute modification manuelle des règles de pouvoirs les rend personnalisées.
  const patchProxy = (patch: Partial<ProxyRules>) => {
    const { preset: _preset, ...rest } = proxy;
    setProxy({ ...rest, ...patch });
  };
  const patchSettings = (patch: Partial<AssemblySettings>) => setSettings({ ...settings, ...patch });

  const checks = [
    quorumRuleSchema.safeParse(quorum),
    proxyRulesSchema.safeParse(proxy),
    settingsSchema.safeParse(settings),
  ];
  const issues = checks.flatMap((c) => (c.success ? [] : c.error.issues.map((i) => i.message)));

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="quorum" value={JSON.stringify(quorum)} />
      <input type="hidden" name="proxy" value={JSON.stringify(proxy)} />
      <input type="hidden" name="settings" value={JSON.stringify(settings)} />

      <Card>
        <CardHeader>
          <CardTitle>Quorum de l&apos;assemblée</CardTitle>
          <CardDescription>
            Calculé sur la clé principale. Une résolution pourra imposer son propre quorum.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RuleEditor
            kind="quorum"
            idPrefix="quorum"
            value={quorum}
            onChange={setQuorum}
            presets={quorumPresets}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pouvoirs</CardTitle>
          <CardDescription>
            Plafonds contrôlés à chaque saisie de pouvoir. Une dérogation n&apos;est possible que par le
            bureau, avec motif tracé.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-preset">Modèle</Label>
            <PresetSelect
              id="proxy-preset"
              presets={proxyPresets}
              value={proxy.preset}
              disabled={disabled}
              onSelect={(p) => p && setProxy(p.params as ProxyRules)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="max-count">Nombre maximal de pouvoirs par mandataire</Label>
              <Input
                id="max-count"
                type="number"
                min={1}
                max={1000}
                placeholder="Sans limite"
                disabled={disabled}
                value={proxy.max_count ?? ""}
                onChange={(e) => patchProxy({ max_count: optionalInt(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="max-share-num">Part maximale des voix détenues (pouvoirs inclus)</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="max-share-num"
                  type="number"
                  min={1}
                  max={1000}
                  className="w-24"
                  placeholder="—"
                  disabled={disabled}
                  value={proxy.max_share?.num ?? ""}
                  onChange={(e) => {
                    const num = optionalInt(e.target.value);
                    patchProxy({
                      max_share: num === null ? null : { num, den: proxy.max_share?.den ?? 100 },
                    });
                  }}
                />
                <span>/</span>
                <Input
                  aria-label="Dénominateur de la part maximale"
                  type="number"
                  min={1}
                  max={1000}
                  className="w-24"
                  disabled={disabled || proxy.max_share === null}
                  value={proxy.max_share?.den ?? ""}
                  onChange={(e) =>
                    proxy.max_share &&
                    patchProxy({ max_share: { num: proxy.max_share.num, den: Number(e.target.value) } })
                  }
                />
                <span className="text-muted-foreground text-sm">de la clé principale</span>
              </div>
            </div>
          </div>
          {proxy.max_count !== null && proxy.max_share !== null && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="combine">Combinaison des deux plafonds</Label>
              <Select
                id="combine"
                value={proxy.combine}
                disabled={disabled}
                onChange={(e) => patchProxy({ combine: e.target.value as ProxyRules["combine"] })}
              >
                <option value="and">Les deux plafonds s&apos;appliquent</option>
                <option value="or">
                  L&apos;un des deux suffit (ex. copropriété : 3 pouvoirs, ou plus si ≤ 10 %)
                </option>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="blank-to">Pouvoirs en blanc</Label>
            <Select
              id="blank-to"
              value={proxy.blank_to}
              disabled={disabled}
              onChange={(e) => patchProxy({ blank_to: e.target.value as ProxyRules["blank_to"] })}
            >
              <option value="president">Attribués au président de séance, qui vote librement</option>
              <option value="board_recommendation">
                Vote selon l&apos;avis du conseil (SA : pour les projets agréés)
              </option>
              <option value="none">Non admis</option>
            </Select>
          </div>
          <Checkbox
            id="forbid-subdelegation"
            label="Interdire la sous-délégation"
            disabled={disabled}
            hint="Un mandataire ne peut pas transmettre un pouvoir reçu."
            checked={proxy.forbid_subdelegation}
            onChange={(v) => patchProxy({ forbid_subdelegation: v })}
          />
          <Checkbox
            id="transfer-departure"
            label="Autoriser la transmission des pouvoirs détenus lors d'un départ"
            disabled={disabled}
            hint="Seule exception à l'interdiction de sous-délégation, toujours tracée."
            checked={proxy.allow_transfer_on_departure}
            onChange={(v) => patchProxy({ allow_transfer_on_departure: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Déroulement des votes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Checkbox
            id="allow-vote-change"
            label="Modification du vote possible tant que le scrutin est ouvert"
            disabled={disabled}
            checked={settings.allow_vote_change}
            onChange={(v) => patchSettings({ allow_vote_change: v })}
          />
          <Checkbox
            id="hide-live-trend"
            label="Masquer la tendance avant la clôture"
            hint="Seul le taux de participation est affiché pendant le scrutin."
            disabled={disabled}
            checked={settings.hide_live_trend}
            onChange={(v) => patchSettings({ hide_live_trend: v })}
          />
          <Checkbox
            id="single-open-ballot"
            label="Un seul scrutin ouvert à la fois"
            disabled={disabled}
            checked={settings.single_open_ballot}
            onChange={(v) => patchSettings({ single_open_ballot: v })}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="departure">Départ d&apos;un votant pendant un scrutin ouvert</Label>
            <Select
              id="departure"
              value={settings.departure_during_ballot}
              disabled={disabled}
              onChange={(e) =>
                patchSettings({
                  departure_during_ballot: e.target.value as AssemblySettings["departure_during_ballot"],
                })
              }
            >
              <option value="transfer_unvoted">
                Le nouveau mandataire peut voter pour lui s&apos;il n&apos;a pas encore voté
              </option>
              <option value="freeze">Aucun vote possible pour lui sur ce scrutin</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {issues.length > 0 && (
        <Alert variant="destructive">
          <ul className="list-inside list-disc">
            {[...new Set(issues)].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.success && <Alert variant="success">{state.success}</Alert>}
      {!disabled && (
        <div>
          <Button type="submit" disabled={pending || issues.length > 0}>
            {pending ? "Enregistrement…" : "Enregistrer les règles"}
          </Button>
        </div>
      )}
    </form>
  );
}
