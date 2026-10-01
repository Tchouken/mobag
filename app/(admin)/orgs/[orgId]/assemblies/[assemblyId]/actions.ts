"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/staff";
import { parseAssemblyInfo } from "@/lib/domain/assembly";
import { proxyRulesSchema, quorumRuleSchema, settingsSchema } from "@/lib/domain/rules";
import { rpcErrorMessage } from "@/lib/rpc/errors";

export type ActionState = { error?: string; success?: string };

const uuid = z.uuid();
const base = (orgId: string, assemblyId: string) => `/orgs/${orgId}/assemblies/${assemblyId}`;

function parseJsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) ?? "null"));
  } catch {
    return undefined;
  }
}

export async function updateInfo(
  orgId: string,
  assemblyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  const parsed = parseAssemblyInfo(formData);
  const version = Number(formData.get("version"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { error } = await supabase.rpc("update_assembly_info", {
    p_assembly: assemblyId,
    p_expected_version: version,
    p_title: v.title,
    p_type: v.type,
    p_legal_family: v.legal_family,
    p_legal_form: v.legal_family === "company" ? v.legal_form : "",
    p_starts_local: `${v.date}T${v.time}`,
    p_timezone: v.timezone,
    p_location: v.location,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(base(orgId, assemblyId), "layout");
  return { success: "Informations enregistrées." };
}

const rulesSchema = z.object({
  quorum: quorumRuleSchema,
  proxy: proxyRulesSchema,
  settings: settingsSchema,
  version: z.number().int().positive(),
});

export async function updateRules(
  orgId: string,
  assemblyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  const parsed = rulesSchema.safeParse({
    quorum: parseJsonField(formData, "quorum"),
    proxy: parseJsonField(formData, "proxy"),
    settings: parseJsonField(formData, "settings"),
    version: Number(formData.get("version")),
  });
  if (!parsed.success) return { error: "Règles invalides : vérifiez les champs signalés." };

  const { error } = await supabase.rpc("update_assembly_rules", {
    p_assembly: assemblyId,
    p_expected_version: parsed.data.version,
    p_quorum_rule: parsed.data.quorum,
    p_proxy_rules: parsed.data.proxy,
    p_settings: parsed.data.settings,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(base(orgId, assemblyId), "layout");
  return { success: "Règles enregistrées." };
}

export async function changeStatus(
  orgId: string,
  assemblyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  const to = z.enum(["draft", "convened"]).safeParse(formData.get("to"));
  if (!to.success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("set_assembly_status", {
    p_assembly: assemblyId,
    p_to: to.data,
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(base(orgId, assemblyId), "layout");
  return {};
}

const weightKeySchema = z.object({
  key: z.union([uuid, z.literal("")]),
  code: z.string().trim().min(1, "Le code est obligatoire."),
  label: z.string().trim().min(1, "Le libellé est obligatoire."),
  total_declared: z.union([z.literal(""), z.coerce.number().positive("Le total doit être positif.")]),
  is_primary: z.boolean(),
});

export async function saveWeightKey(
  orgId: string,
  assemblyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  const parsed = weightKeySchema.safeParse({
    key: String(formData.get("key") ?? ""),
    code: String(formData.get("code") ?? ""),
    label: String(formData.get("label") ?? ""),
    total_declared: String(formData.get("total_declared") ?? "")
      .replace(",", ".")
      .replace(/\s/g, ""),
    is_primary: formData.get("is_primary") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { error } = await supabase.rpc("upsert_weight_key", {
    p_assembly: assemblyId,
    p_key: v.key === "" ? (null as unknown as string) : v.key,
    p_code: v.code,
    p_label: v.label,
    p_total_declared: v.total_declared === "" ? (null as unknown as number) : v.total_declared,
    p_is_primary: v.is_primary,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`${base(orgId, assemblyId)}/weight-keys`);
  return { success: "Clé enregistrée." };
}

export async function deleteWeightKey(
  orgId: string,
  assemblyId: string,
  keyId: string,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  if (!uuid.safeParse(keyId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("delete_weight_key", { p_key: keyId });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`${base(orgId, assemblyId)}/weight-keys`);
  return {};
}

const staffRole = z.enum(["president", "secretary", "scrutineer", "reception"]);

export async function assignStaff(
  orgId: string,
  assemblyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  const user = uuid.safeParse(formData.get("user"));
  const role = staffRole.safeParse(formData.get("role"));
  if (!user.success || !role.success) return { error: "Choisissez une personne et un rôle." };
  const { error } = await supabase.rpc("assign_assembly_staff", {
    p_assembly: assemblyId,
    p_user: user.data,
    p_role: role.data,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`${base(orgId, assemblyId)}/staff`);
  return {};
}

export async function removeStaff(
  orgId: string,
  assemblyId: string,
  userId: string,
  role: string,
): Promise<ActionState> {
  const { supabase } = await requireStaffUser();
  const parsedRole = staffRole.safeParse(role);
  if (!uuid.safeParse(userId).success || !parsedRole.success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("remove_assembly_staff", {
    p_assembly: assemblyId,
    p_user: userId,
    p_role: parsedRole.data,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`${base(orgId, assemblyId)}/staff`);
  return {};
}
