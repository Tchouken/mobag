import { AssignStaffForm, RemoveStaffButton } from "@/components/assembly/staff-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STAFF_ROLE_LABELS } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function StaffPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/staff">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const editable = canManage && assembly.status !== "closed" && assembly.status !== "archived";

  const [{ data: staff, error }, { data: members }] = await Promise.all([
    supabase
      .from("assembly_staff")
      .select("user_id, role, profiles(email, full_name)")
      .eq("assembly_id", assembly.id)
      .order("role"),
    supabase.from("org_members").select("user_id, profiles(email, full_name)").eq("org_id", org.id),
  ]);
  if (error) throw error;

  const label = (p: { email: string | null; full_name: string | null } | null) =>
    p?.full_name ?? p?.email ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Bureau et accueil</CardTitle>
          <CardDescription>
            Le bureau (président, secrétaire, scrutateurs) pilote la séance et valide les résultats.
            L&apos;accueil gère l&apos;émargement et les pouvoirs en séance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-muted-foreground text-sm">Personne n&apos;est encore désigné.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personne</TableHead>
                  <TableHead>Rôle</TableHead>
                  {editable && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={`${s.user_id}-${s.role}`}>
                    <TableCell>{label(s.profiles)}</TableCell>
                    <TableCell>{STAFF_ROLE_LABELS[s.role]}</TableCell>
                    {editable && (
                      <TableCell className="text-right">
                        <RemoveStaffButton
                          orgId={org.id}
                          assemblyId={assembly.id}
                          userId={s.user_id}
                          role={s.role}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Désigner</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignStaffForm
              orgId={org.id}
              assemblyId={assembly.id}
              members={(members ?? []).map((m) => ({ user_id: m.user_id, label: label(m.profiles) }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
