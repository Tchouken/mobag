import { Badge } from "@/components/ui/badge";
import { ASSEMBLY_STATUS_LABELS, type AssemblyStatus } from "@/lib/assembly-labels";

const VARIANTS: Record<AssemblyStatus, "secondary" | "outline" | "success" | "warning" | "default"> = {
  draft: "outline",
  convened: "secondary",
  in_session: "warning",
  closed: "success",
  archived: "outline",
};

export function StatusBadge({ status }: { status: AssemblyStatus }) {
  return <Badge variant={VARIANTS[status]}>{ASSEMBLY_STATUS_LABELS[status]}</Badge>;
}
