import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { requireStaffUser } from "@/lib/auth/staff";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { user, isPlatformAdmin } = await requireStaffUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/orgs" className="text-lg font-semibold">
            MobAG
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">
              {user.email}
              {isPlatformAdmin && " · super-admin"}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
