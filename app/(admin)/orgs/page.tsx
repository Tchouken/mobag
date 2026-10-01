import type { Metadata } from "next";
import Link from "next/link";
import { CreateOrgForm } from "@/components/admin/create-org-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffUser } from "@/lib/auth/staff";
import { ORG_ROLE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Organisations — MobAG" };

export default async function OrgsPage() {
  const { supabase, user, isPlatformAdmin } = await requireStaffUser();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, slug, org_members(user_id, role)")
    .order("name");
  if (error) throw error;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Organisations</h1>

      {isPlatformAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Nouvelle organisation</CardTitle>
            <CardDescription>Réservé au super-admin MobilActif.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrgForm />
          </CardContent>
        </Card>
      )}

      {orgs.length === 0 ? (
        <p className="text-muted-foreground">
          Vous n&apos;êtes membre d&apos;aucune organisation. Demandez une invitation à son administrateur.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orgs.map((org) => {
            const myRole = org.org_members.find((m) => m.user_id === user.id)?.role;
            return (
              <li key={org.id}>
                <Link
                  href={`/orgs/${org.id}`}
                  className="border-border hover:bg-muted flex items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <span className="font-medium">{org.name}</span>
                  {myRole ? (
                    <Badge variant="secondary">{ORG_ROLE_LABELS[myRole]}</Badge>
                  ) : (
                    <Badge variant="outline">Support</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
