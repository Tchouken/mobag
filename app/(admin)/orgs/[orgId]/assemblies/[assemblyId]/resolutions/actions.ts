"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/staff";
import { resolutionSchema } from "@/lib/domain/resolution";
import { isValidRichText } from "@/lib/rich-text/render";
import { rpcErrorMessage } from "@/lib/rpc/errors";

const uuid = z.uuid();
const listPath = (orgId: string, assemblyId: string) => `/orgs/${orgId}/assemblies/${assemblyId}/resolutions`;

export type SaveResult = { error?: string };

export async function saveResolution(
  orgId: string,
  assemblyId: string,
  resolutionId: string | null,
  version: number | null,
  input: unknown,
  reason: string,
): Promise<SaveResult> {
  const { supabase } = await requireStaffUser();
  const parsed = resolutionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Résolution invalide." };
  if (!isValidRichText(parsed.data.body)) return { error: "Le texte de la résolution est invalide." };

  const { error } = await supabase.rpc("upsert_resolution", {
    p_assembly: assemblyId,
    p_resolution: resolutionId as string,
    p_data: parsed.data as never,
    p_expected_version: version as number,
    p_reason: reason,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(listPath(orgId, assemblyId), "layout");
  redirect(listPath(orgId, assemblyId));
}

export async function deleteResolution(
  orgId: string,
  assemblyId: string,
  resolutionId: string,
  reason: string,
): Promise<SaveResult> {
  const { supabase } = await requireStaffUser();
  if (!uuid.safeParse(resolutionId).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("delete_resolution", { p_resolution: resolutionId, p_reason: reason });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(listPath(orgId, assemblyId), "layout");
  redirect(listPath(orgId, assemblyId));
}

export async function reorderResolutions(
  orgId: string,
  assemblyId: string,
  parentId: string | null,
  orderedIds: string[],
): Promise<SaveResult> {
  const { supabase } = await requireStaffUser();
  if (!z.array(uuid).min(1).safeParse(orderedIds).success) return { error: "Requête invalide." };
  const { error } = await supabase.rpc("reorder_resolutions", {
    p_assembly: assemblyId,
    p_parent: parentId as string,
    p_ordered_ids: orderedIds,
  });
  if (error) return { error: rpcErrorMessage(error) };
  revalidatePath(listPath(orgId, assemblyId));
  return {};
}

export async function registerAttachment(
  orgId: string,
  assemblyId: string,
  resolutionId: string,
  path: string,
  filename: string,
): Promise<SaveResult> {
  const { supabase } = await requireStaffUser();
  const { error } = await supabase.rpc("add_resolution_attachment", {
    p_resolution: resolutionId,
    p_path: path,
    p_filename: filename,
  });
  if (error) {
    // Fichier déposé mais non enregistré : on le retire pour ne pas laisser d'orphelin.
    await supabase.storage.from("attachments").remove([path]);
    return { error: rpcErrorMessage(error) };
  }
  revalidatePath(`${listPath(orgId, assemblyId)}/${resolutionId}`);
  return {};
}

export async function removeAttachment(
  orgId: string,
  assemblyId: string,
  resolutionId: string,
  attachmentId: string,
): Promise<SaveResult> {
  const { supabase } = await requireStaffUser();
  const { data: path, error } = await supabase.rpc("remove_resolution_attachment", {
    p_attachment: attachmentId,
  });
  if (error) return { error: rpcErrorMessage(error) };
  await supabase.storage.from("attachments").remove([path]);
  revalidatePath(`${listPath(orgId, assemblyId)}/${resolutionId}`);
  return {};
}

export async function attachmentUrl(path: string): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireStaffUser();
  // La RLS de Storage vérifie que l'utilisateur peut lire l'assemblée du chemin.
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 60, { download: true });
  if (error || !data) return { error: "Fichier introuvable." };
  return { url: data.signedUrl };
}
