"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/staff";
import { ORG_ROLES } from "@/lib/labels";
import { rpcErrorMessage } from "@/lib/rpc/errors";

export type InviteState = { error?: string; link?: string; email?: string };
export type ActionResult = { error?: string };

const uuid = z.uuid();
const role = z.enum(ORG_ROLES);

export async function inviteMember(
  orgId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { supabase } = await requireStaffUser();
  const parsed = z
    .object({ email: z.email("Adresse e-mail invalide."), role })
    .safeParse({ email: String(formData.get("email") ?? "").trim(), role: formData.get("role") });
  if (!parsed.success || !uuid.safeParse(orgId).success) {
    return { error: parsed.error?.issues[0]?.message ?? "Requête invalide." };
  }

  const { data, error } = await supabase.rpc("invite_org_member", {
    p_org: orgId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { error: rpcErrorMessage(error) };

  const token = (data as { token: string }).token;
  const origin = (await headers()).get("origin") ?? "";
  revalidatePath(`/orgs/${orgId}/members`);
  return { link: `${origin}/invitations/${token}`, email: parsed.data.email };
}

export async function revokeInvitation(orgId: string, invitationId: string): Promise<ActionResult> {
  const { supabase } = await requireStaffUser();
  if (!uuid.safeParse(invitationId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("revoke_org_invitation", { p_invitation: invitationId });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`/orgs/${orgId}/members`);
  return {};
}

export async function changeRole(orgId: string, userId: string, newRole: string): Promise<ActionResult> {
  const { supabase } = await requireStaffUser();
  const parsedRole = role.safeParse(newRole);
  if (!parsedRole.success || !uuid.safeParse(userId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("set_org_member_role", {
    p_org: orgId,
    p_user: userId,
    p_role: parsedRole.data,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`/orgs/${orgId}/members`);
  return {};
}

export async function removeMember(orgId: string, userId: string): Promise<ActionResult> {
  const { supabase } = await requireStaffUser();
  if (!uuid.safeParse(userId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("remove_org_member", { p_org: orgId, p_user: userId });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(`/orgs/${orgId}/members`);
  return {};
}
