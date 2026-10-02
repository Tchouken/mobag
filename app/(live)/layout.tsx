import { requireStaffUser } from "@/lib/auth/staff";

// Écrans de séance (accueil, régie) : plein écran, sans l'en-tête de l'administration.
export default async function LiveLayout({ children }: LayoutProps<"/">) {
  await requireStaffUser();
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
