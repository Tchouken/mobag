"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/staff";
import { parseViolations, type Violation } from "@/lib/proxies";
import { rpcErrorCode, rpcErrorMessage } from "@/lib/rpc/errors";

const uuid = z.uuid();
const path = (orgId: string, assemblyId: string) => `/orgs/${orgId}/assemblies/${assemblyId}/proxies`;

export type GrantResult =
  { ok: true; proxyId: string } | { ok: false; error: string; violations?: Violation[] };

const holderSchema = z.union([
  z.object({ attendee_id: uuid }),
  z.object({ member_id: uuid }),
  z.object({
    full_name: z.string().trim().min(1, "Indiquez le nom du mandataire.").max(200),
    email: z.union([z.email("E-mail du mandataire invalide."), z.literal("")]).optional(),
  }),
]);

const grantSchema = z.object({
  grantor: uuid,
  type: z.enum(["named", "blank"]),
  holder: holderSchema.nullable(),
  derogation: z.string().trim().max(500).optional(),
});

export async function grantProxy(orgId: string, assemblyId: string, input: unknown): Promise<GrantResult> {
  const { supabase } = await requireStaffUser();
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  if (parsed.data.type === "named" && !parsed.data.holder)
    return { ok: false, error: "Indiquez le mandataire." };

  const { data, error } = await supabase.rpc("grant_proxy_to", {
    p_assembly: assemblyId,
    p_grantor: parsed.data.grantor,
    p_holder: (parsed.data.holder ?? null) as never,
    p_type: parsed.data.type,
    p_derogation_reason: parsed.data.derogation ?? "",
  });
  if (error) {
    const violations =
      rpcErrorCode(error) === "proxy_rule_violation" ? parseViolations(error.details) : undefined;
    return { ok: false, error: rpcErrorMessage(error), violations };
  }
  revalidatePath(path(orgId, assemblyId));
  return { ok: true, proxyId: data };
}

export async function revokeProxy(orgId: string, assemblyId: string, proxyId: string, reason: string) {
  const { supabase } = await requireStaffUser();
  if (!uuid.safeParse(proxyId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("revoke_proxy", { p_proxy: proxyId, p_reason: reason });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(path(orgId, assemblyId));
  return {};
}

export async function attachProxyDocument(
  orgId: string,
  assemblyId: string,
  proxyId: string,
  objectPath: string,
) {
  const { supabase } = await requireStaffUser();
  const { error } = await supabase.rpc("set_proxy_document", { p_proxy: proxyId, p_path: objectPath });
  if (error) {
    await supabase.storage.from("proxy-documents").remove([objectPath]);
    return { error: rpcErrorMessage(error) };
  }
  revalidatePath(path(orgId, assemblyId));
  return {};
}

export async function proxyDocumentUrl(objectPath: string): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireStaffUser();
  const { data, error } = await supabase.storage.from("proxy-documents").createSignedUrl(objectPath, 60);
  if (error || !data) return { error: "Document introuvable." };
  return { url: data.signedUrl };
}

export type ProxyImportReport = {
  ok: boolean;
  dry_run: boolean;
  rows: number;
  created: number;
  valid: number | null;
  error_count: number;
  errors: { line: number; code: string; grantor_ref: string | null; detail: Violation[] | null }[];
};

const rowsSchema = z
  .array(
    z.object({
      line: z.number().int(),
      grantor_ref: z.string().max(50),
      holder_ref: z.string().max(50).optional(),
      holder_name: z.string().max(200).optional(),
      holder_email: z.string().max(254).optional(),
      type: z.string().max(50),
    }),
  )
  .min(1)
  .max(5000);

export async function submitProxyImport(
  orgId: string,
  assemblyId: string,
  rows: unknown,
  source: { filename: string; sha256: string },
  dryRun: boolean,
): Promise<{ ok: true; report: ProxyImportReport } | { ok: false; error: string }> {
  const { supabase } = await requireStaffUser();
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Données d'import invalides." };
  const { data, error } = await supabase.rpc("import_proxies", {
    p_assembly: assemblyId,
    p_rows: parsed.data as never,
    p_dry_run: dryRun,
    p_source: source,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error) };
  if (!dryRun) revalidatePath(path(orgId, assemblyId));
  return { ok: true, report: data as unknown as ProxyImportReport };
}
