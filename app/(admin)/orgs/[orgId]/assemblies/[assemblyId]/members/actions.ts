"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/staff";
import { ImportFileError, parseImportFile } from "@/lib/import/parse";
import type { ImportReport } from "@/lib/import/report";
import type { ParsedSheet } from "@/lib/import/table";
import { normalizeNumber } from "@/lib/import/table";
import { rpcErrorMessage } from "@/lib/rpc/errors";

const uuid = z.uuid();
const modeSchema = z.enum(["append", "upsert", "replace"]);
const rowsSchema = z.array(z.record(z.string(), z.unknown())).min(1).max(20000);
const sourceSchema = z.object({ filename: z.string().max(255), sha256: z.string().regex(/^[0-9a-f]{64}$/) });

const membersPath = (orgId: string, assemblyId: string) => `/orgs/${orgId}/assemblies/${assemblyId}/members`;

export type ParseResult =
  | { ok: true; sheet: ParsedSheet; source: { filename: string; sha256: string } }
  | { ok: false; error: string };

export async function parseFile(formData: FormData): Promise<ParseResult> {
  await requireStaffUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choisissez un fichier." };
  try {
    const sheet = await parseImportFile(file);
    const sha256 = createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .digest("hex");
    return { ok: true, sheet, source: { filename: file.name, sha256 } };
  } catch (error) {
    if (error instanceof ImportFileError) return { ok: false, error: error.message };
    return { ok: false, error: "Fichier illisible." };
  }
}

export type ImportResult = { ok: true; report: ImportReport } | { ok: false; error: string };

export async function submitImport(
  orgId: string,
  assemblyId: string,
  rows: unknown,
  mode: string,
  source: unknown,
  dryRun: boolean,
): Promise<ImportResult> {
  const { supabase } = await requireStaffUser();
  const parsedRows = rowsSchema.safeParse(rows);
  const parsedMode = modeSchema.safeParse(mode);
  const parsedSource = sourceSchema.safeParse(source);
  if (
    !uuid.safeParse(assemblyId).success ||
    !parsedRows.success ||
    !parsedMode.success ||
    !parsedSource.success
  ) {
    return { ok: false, error: "Données d'import invalides." };
  }

  const { data, error } = await supabase.rpc("import_members", {
    p_assembly: assemblyId,
    p_rows: parsedRows.data as never,
    p_mode: parsedMode.data,
    p_dry_run: dryRun,
    p_source: parsedSource.data,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error) };
  if (!dryRun) revalidatePath(membersPath(orgId, assemblyId), "layout");
  return { ok: true, report: data as unknown as ImportReport };
}

export type MemberFormState = { error?: string; details?: string[] };

export async function saveMember(
  orgId: string,
  assemblyId: string,
  memberId: string | null,
  version: number | null,
  keyCodes: string[],
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const { supabase } = await requireStaffUser();
  const text = (name: string) => String(formData.get(name) ?? "");
  const row = {
    kind: text("kind"),
    last_name: text("last_name"),
    first_name: text("first_name"),
    company_name: text("company_name"),
    display_name: text("display_name"),
    external_ref: text("external_ref"),
    email: text("email"),
    phone: text("phone"),
    representative_name: text("representative_name"),
    is_proxy_ineligible: formData.get("is_proxy_ineligible") === "on",
    weights: Object.fromEntries(keyCodes.map((code) => [code, normalizeNumber(text(`weight_${code}`))])),
  };

  const { error } = await supabase.rpc("upsert_member", {
    p_assembly: assemblyId,
    p_member: memberId as string,
    p_row: row,
    p_expected_version: version as number,
  });
  if (error) {
    if (error.message === "invalid_member" && error.details) {
      const { issueMessage } = await import("@/lib/import/report");
      try {
        const issues = JSON.parse(error.details) as { code: string }[];
        return { error: rpcErrorMessage(error), details: issues.map((i) => issueMessage(i.code)) };
      } catch {
        /* détails non exploitables : message général */
      }
    }
    return { error: rpcErrorMessage(error) };
  }
  revalidatePath(membersPath(orgId, assemblyId), "layout");
  redirect(membersPath(orgId, assemblyId));
}

export async function deleteMember(
  orgId: string,
  assemblyId: string,
  memberId: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireStaffUser();
  if (!uuid.safeParse(memberId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("delete_member", { p_member: memberId });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(membersPath(orgId, assemblyId), "layout");
  redirect(membersPath(orgId, assemblyId));
}
