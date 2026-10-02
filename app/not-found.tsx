import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground">
        Cette page n&apos;existe pas, ou vous n&apos;avez pas les droits pour la consulter.
      </p>
      <Link href="/" className="underline">
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
