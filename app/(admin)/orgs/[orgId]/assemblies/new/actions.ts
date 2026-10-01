"use server";

import { redirect } from "next/navigation";
import { requireStaffUser } from "@/lib/auth/staff";
import { parseAssemblyInfo } from "@/lib/domain/assembly";
import { rpcErrorMessage } from "@/lib/rpc/errors";

export type FormState = { error?: string };

export async function createAssembly(
  orgId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireStaffUser();
  const parsed = parseAssemblyInfo(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { data, error } = await supabase.rpc("create_assembly", {
    p_org: orgId,
    p_title: v.title,
    p_type: v.type,
    p_legal_family: v.legal_family,
    p_legal_form: v.legal_family === "company" ? v.legal_form : "",
    p_starts_local: `${v.date}T${v.time}`,
    p_timezone: v.timezone,
    p_location: v.location,
  });
  if (error) return { error: rpcErrorMessage(error) };
  redirect(`/orgs/${orgId}/assemblies/${data}/settings`);
}
