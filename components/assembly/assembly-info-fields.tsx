"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ASSEMBLY_TYPE_LABELS,
  LEGAL_FAMILY_LABELS,
  LEGAL_FORM_LABELS,
  TIMEZONES,
  type AssemblyType,
  type LegalFamily,
  type LegalForm,
} from "@/lib/assembly-labels";

export type AssemblyInfoDefaults = {
  title?: string;
  type?: AssemblyType;
  legal_family?: LegalFamily;
  legal_form?: LegalForm | "";
  date?: string;
  time?: string;
  timezone?: string;
  location?: string;
};

// Champs partagés par la création et l'édition d'une assemblée.
export function AssemblyInfoFields({
  defaults = {},
  disabled,
}: {
  defaults?: AssemblyInfoDefaults;
  disabled?: boolean;
}) {
  const [family, setFamily] = useState<LegalFamily>(defaults.legal_family ?? "company");

  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="title">Intitulé</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={defaults.title}
          placeholder="Assemblée générale ordinaire annuelle 2026"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="legal_family">Organisme</Label>
        <Select
          id="legal_family"
          name="legal_family"
          value={family}
          onChange={(e) => setFamily(e.target.value as LegalFamily)}
        >
          {Object.entries(LEGAL_FAMILY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {family === "company" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="legal_form">Forme juridique</Label>
          <Select id="legal_form" name="legal_form" defaultValue={defaults.legal_form ?? "sa"}>
            {Object.entries(LEGAL_FORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <input type="hidden" name="legal_form" value="" />
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="type">Type d&apos;assemblée</Label>
        <Select id="type" name="type" defaultValue={defaults.type ?? "ago"}>
          {Object.entries(ASSEMBLY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Lieu</Label>
        <Input id="location" name="location" maxLength={300} defaultValue={defaults.location} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" required defaultValue={defaults.date} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="time">Heure</Label>
        <Input id="time" name="time" type="time" required defaultValue={defaults.time ?? "14:00"} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Fuseau horaire</Label>
        <Select id="timezone" name="timezone" defaultValue={defaults.timezone ?? "Europe/Paris"}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </div>
    </fieldset>
  );
}
