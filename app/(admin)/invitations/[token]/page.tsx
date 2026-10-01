import type { Metadata } from "next";
import { AcceptInvitationForm } from "@/components/admin/accept-invitation-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { requireStaffUser } from "@/lib/auth/staff";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/labels";

export const metadata: Metadata = { title: "Invitation — MobAG" };

type Invitation = {
  org_id: string;
  org_name: string;
  email: string;
  role: OrgRole;
  status: "pending" | "accepted" | "revoked" | "expired";
};

const STATUS_MESSAGES: Record<Exclude<Invitation["status"], "pending">, string> = {
  accepted: "Cette invitation a déjà été acceptée.",
  revoked: "Cette invitation a été révoquée par l'administrateur.",
  expired: "Cette invitation a expiré. Demandez-en une nouvelle à l'administrateur.",
};

export default async function InvitationPage({ params }: PageProps<"/invitations/[token]">) {
  const { token } = await params;
  const { supabase, user } = await requireStaffUser();
  const { data } = await supabase.rpc("get_org_invitation", { p_token: token });
  const invitation = data as Invitation | null;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Invitation</CardTitle>
          {invitation && (
            <CardDescription>
              Rejoindre <strong>{invitation.org_name}</strong> en tant que{" "}
              {ORG_ROLE_LABELS[invitation.role].toLowerCase()}.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!invitation ? (
            <Alert variant="destructive">Lien d&apos;invitation invalide.</Alert>
          ) : invitation.status !== "pending" ? (
            <Alert variant="destructive">{STATUS_MESSAGES[invitation.status]}</Alert>
          ) : invitation.email.toLowerCase() !== user.email?.toLowerCase() ? (
            <>
              <Alert variant="destructive">
                Cette invitation est destinée à <strong>{invitation.email}</strong>, mais vous êtes connecté
                avec <strong>{user.email}</strong>.
              </Alert>
              <form action={signOut}>
                <Button type="submit" variant="outline" className="w-full">
                  Changer de compte
                </Button>
              </form>
            </>
          ) : (
            <AcceptInvitationForm token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
