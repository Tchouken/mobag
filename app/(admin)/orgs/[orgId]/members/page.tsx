import Link from "next/link";
import { InviteForm } from "@/components/admin/invite-form";
import { MemberControls, RevokeInvitationButton } from "@/components/admin/member-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/org";
import { formatDateTime, ORG_ROLE_LABELS } from "@/lib/labels";

export default async function MembersPage({ params }: PageProps<"/orgs/[orgId]/members">) {
  const { orgId } = await params;
  const { supabase, org, user, canAdmin } = await requireOrg(orgId);

  const { data: members, error } = await supabase
    .from("org_members")
    .select("user_id, role, created_at, profiles(email, full_name)")
    .eq("org_id", org.id)
    .order("created_at");
  if (error) throw error;

  const { data: invitations } = canAdmin
    ? await supabase
        .from("org_invitations")
        .select("id, email, role, expires_at, created_at")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/orgs/${org.id}`} className="text-muted-foreground text-sm hover:underline">
          ← {org.name}
        </Link>
        <h1 className="text-2xl font-semibold">Équipe</h1>
      </div>

      {canAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Inviter un membre</CardTitle>
            <CardDescription>
              Les administrateurs gèrent l&apos;équipe ; les organisateurs préparent et pilotent les AG.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm orgId={org.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Membres ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Personne</TableHead>
                <TableHead>Depuis</TableHead>
                <TableHead className="text-right">Rôle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>
                    <div className="font-medium">{m.profiles?.full_name ?? m.profiles?.email}</div>
                    {m.profiles?.full_name && (
                      <div className="text-muted-foreground text-sm">{m.profiles.email}</div>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTime(m.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <MemberControls
                      orgId={org.id}
                      userId={m.user_id}
                      role={m.role}
                      isSelf={m.user_id === user.id}
                      canAdmin={canAdmin}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canAdmin && invitations && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{ORG_ROLE_LABELS[inv.role]}</TableCell>
                    <TableCell>
                      {new Date(inv.expires_at) < new Date() ? "Expirée" : formatDateTime(inv.expires_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeInvitationButton orgId={org.id} invitationId={inv.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
