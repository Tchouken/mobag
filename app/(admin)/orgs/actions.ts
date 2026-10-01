"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/staff";
import { rpcErrorMessage } from "@/lib/rpc/errors";
import { slugify } from "@/lib/slug";

export type FormState = { error?: string };

const createOrgSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
  slug: z.string().trim().max(60),
});

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireStaffUser();
  const parsed = createOrgSchema.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
  const slug = parsed.data.slug || slugify(parsed.data.name);

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: slug,
  });
  if (error) {
    return { error: rpcErrorMessage(error) };
  }
  redirect(`/orgs/${data}`);
}
