import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — MobAG" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const failed = params.error === "lien_invalide";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Espace organisateurs. Saisissez votre adresse : vous recevrez un lien de connexion, sans mot de
            passe.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {failed && (
            <Alert variant="destructive">
              Ce lien de connexion est invalide ou expiré. Demandez-en un nouveau.
            </Alert>
          )}
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
