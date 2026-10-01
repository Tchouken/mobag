"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { describeRule, type MajorityRule, type QuorumRule, type RuleCondition } from "@/lib/domain/rules";
import { LEGAL_FAMILY_LABELS, type LegalFamily } from "@/lib/assembly-labels";

export type Preset = {
  code: string;
  kind: string;
  assembly_family: string;
  label_fr: string;
  description_fr: string | null;
  legal_reference: string | null;
  params: unknown;
  abstention_policy?: string | null;
};

type Rule = QuorumRule | MajorityRule;

type Props<K extends "quorum" | "majority"> = {
  kind: K;
  value: K extends "quorum" ? QuorumRule : MajorityRule;
  onChange: (rule: K extends "quorum" ? QuorumRule : MajorityRule) => void;
  presets: Preset[];
  disabled?: boolean;
  idPrefix: string;
  onPresetSelect?: (preset: Preset) => void;
};

const FAMILY_ORDER = ["company", "association", "copro", "generic"];

export function PresetSelect({
  presets,
  value,
  onSelect,
  disabled,
  id,
}: {
  presets: Preset[];
  value: string | undefined;
  onSelect: (preset: Preset | undefined) => void;
  disabled?: boolean;
  id: string;
}) {
  const known = presets.some((p) => p.code === value);
  const groups = FAMILY_ORDER.map((family) => ({
    family,
    items: presets.filter((p) => p.assembly_family === family),
  })).filter((g) => g.items.length > 0);

  return (
    <Select
      id={id}
      value={known ? value : ""}
      disabled={disabled}
      onChange={(e) => onSelect(presets.find((p) => p.code === e.target.value))}
    >
      <option value="">Règle personnalisée</option>
      {groups.map((g) => (
        <optgroup
          key={g.family}
          label={g.family === "generic" ? "Modèles génériques" : LEGAL_FAMILY_LABELS[g.family as LegalFamily]}
        >
          {g.items.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label_fr}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function RuleEditor<K extends "quorum" | "majority">({
  kind,
  value,
  onChange,
  presets,
  disabled,
  idPrefix,
  onPresetSelect,
}: Props<K>) {
  const rule = value as Rule;
  const selected = presets.find((p) => p.code === rule.preset);
  type Out = Parameters<typeof onChange>[0];

  // Toute modification manuelle fait de la règle une règle personnalisée.
  const setConditions = (conditions: RuleCondition[]) => onChange({ conditions } as unknown as Out);

  const update = (index: number, patch: Partial<RuleCondition>) =>
    setConditions(rule.conditions.map((c, i) => (i === index ? ({ ...c, ...patch } as RuleCondition) : c)));

  const addCondition = () =>
    setConditions([
      ...rule.conditions,
      kind === "quorum"
        ? {
            measure: "weight",
            numerator: "present_represented",
            base: "all_members",
            num: 1,
            den: 4,
            comparison: "gte",
          }
        : { measure: "weight", numerator: "for", base: "expressed", num: 1, den: 2, comparison: "gt" },
    ] as RuleCondition[]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-preset`}>Modèle</Label>
        <PresetSelect
          id={`${idPrefix}-preset`}
          presets={presets}
          value={rule.preset}
          disabled={disabled}
          onSelect={(p) => {
            if (!p) return;
            onChange(p.params as Out);
            onPresetSelect?.(p);
          }}
        />
        {selected && (selected.description_fr || selected.legal_reference) && (
          <p className="text-muted-foreground text-sm">
            {selected.description_fr} {selected.legal_reference && `Référence : ${selected.legal_reference}.`}
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {rule.conditions.map((c, i) => (
          <li key={i} className="border-border flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idPrefix}-${i}-measure`} className="text-xs">
                  Compté
                </Label>
                <Select
                  id={`${idPrefix}-${i}-measure`}
                  className="w-44"
                  value={c.measure}
                  disabled={disabled}
                  onChange={(e) => update(i, { measure: e.target.value as RuleCondition["measure"] })}
                >
                  <option value="weight">en voix</option>
                  <option value="heads">en nombre de membres</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idPrefix}-${i}-comparison`} className="text-xs">
                  Seuil
                </Label>
                <Select
                  id={`${idPrefix}-${i}-comparison`}
                  className="w-32"
                  value={c.comparison}
                  disabled={disabled}
                  onChange={(e) => update(i, { comparison: e.target.value as RuleCondition["comparison"] })}
                >
                  <option value="gt">plus de</option>
                  <option value="gte">au moins</option>
                </Select>
              </div>
              <div className="flex items-end gap-1">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idPrefix}-${i}-num`} className="text-xs">
                    Fraction
                  </Label>
                  <Input
                    id={`${idPrefix}-${i}-num`}
                    type="number"
                    min={1}
                    max={1000}
                    className="w-20"
                    value={c.num}
                    disabled={disabled}
                    onChange={(e) => update(i, { num: Number(e.target.value) })}
                  />
                </div>
                <span className="pb-2">/</span>
                <Input
                  aria-label="Dénominateur"
                  type="number"
                  min={1}
                  max={1000}
                  className="w-20"
                  value={c.den}
                  disabled={disabled}
                  onChange={(e) => update(i, { den: Number(e.target.value) })}
                />
              </div>
              {kind === "majority" ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idPrefix}-${i}-base`} className="text-xs">
                    Base
                  </Label>
                  <Select
                    id={`${idPrefix}-${i}-base`}
                    className="w-56"
                    value={c.base}
                    disabled={disabled}
                    onChange={(e) => update(i, { base: e.target.value as RuleCondition["base"] })}
                  >
                    <option value="expressed">des voix exprimées</option>
                    <option value="present_represented">des présents et représentés</option>
                    <option value="all_members">de tous les membres</option>
                  </Select>
                </div>
              ) : (
                <span className="pb-2 text-sm">de tous les membres</span>
              )}
              {!disabled && (kind === "quorum" || rule.conditions.length > 1) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConditions(rule.conditions.filter((_, j) => j !== i))}
                >
                  Retirer
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {!disabled && rule.conditions.length < 4 && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addCondition}>
            Ajouter une condition
          </Button>
        </div>
      )}

      <p className="bg-muted rounded-md px-3 py-2 text-sm">
        <span className="font-medium">{kind === "quorum" ? "Quorum : " : "Adoption si : "}</span>
        {kind === "quorum" && rule.conditions.length === 0 ? "aucun quorum requis" : describeRule(rule)}
      </p>
    </div>
  );
}
