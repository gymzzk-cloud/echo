import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input, Notice } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { sha256 } from "@/lib/util";
import { acceptInvite } from "@/app/actions-echipa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitație", robots: { index: false } };

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db.select({ inv: schema.invites, org: schema.orgs }).from(schema.invites).innerJoin(schema.orgs, eq(schema.orgs.id, schema.invites.orgId))
    .where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date()))).limit(1);
  const user = await currentUser();
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-sm px-4 py-16">
        {!row ? <Notice tone="warn">Invitația a expirat sau a fost deja folosită. Cere una nouă.</Notice> : (
          <Card>
            <h1 className="text-xl font-semibold">Intră în {row.org.name}</h1>
            <p className="mb-5 mt-1 text-sm text-muted">Invitație pentru {row.inv.email}.</p>
            <ActionForm action={acceptInvite} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              {!user && (<>
                <Field label="Numele tău"><Input name="name" autoComplete="name" /></Field>
                <Field label="Alege o parolă" hint="Cel puțin 10 caractere."><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
              </>)}
              <SubmitButton className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg">Acceptă invitația</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </main>
    </>
  );
}
