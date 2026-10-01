"use server";

import { redirect } from "next/navigation";
import { requireStaffUser } from "@/lib/auth/staff";
import { rpcErrorMessage } from "@/lib/rpc/errors";

export async function acceptInvitation(
  token: string,
  _prev: { error?: string },
): Promise<{ error?: string }> {
  const { supabase } = await requireStaffUser();
  const { data: orgId, error } = await supabase.rpc("accept_org_invitation", { p_token: token });
  if (error) return { error: rpcErrorMessage(error) };
  redirect(`/orgs/${orgId}`);
}
