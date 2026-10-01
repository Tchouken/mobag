import { WeightKeyForm, WeightKeyRowActions } from "@/components/assembly/weight-key-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });

export default async function WeightKeysPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/weight-keys">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const editable = canManage && isEditableStatus(assembly.status);

  const { data: keys, error } = await supabase
    .from("weight_keys")
    .select("id, code, label, total_declared, is_primary")
    .eq("assembly_id", assembly.id)
    .order("position");
  if (error) throw error;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Clés de répartition</CardTitle>
          <CardDescription>
            Chaque membre a un nombre de voix par clé (0 s&apos;il n&apos;est pas concerné). Chaque résolution
            est votée selon une clé. Le total déclaré sert de contrôle de cohérence à l&apos;import des
            participants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Total déclaré</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>
                    <span className="font-medium">{k.label}</span>{" "}
                    {k.is_primary && <Badge variant="secondary">Principale</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{k.code}</TableCell>
                  <TableCell className="text-right">
                    {k.total_declared === null ? "—" : numberFormat.format(k.total_declared)}
                  </TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <WeightKeyRowActions orgId={org.id} assemblyId={assembly.id} weightKey={k} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une clé</CardTitle>
            <CardDescription>
              Ex. : actions de préférence, droits de vote double, tantièmes d&apos;un bâtiment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeightKeyForm key={keys.length} orgId={org.id} assemblyId={assembly.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
