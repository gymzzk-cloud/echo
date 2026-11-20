import QRCode from "qrcode";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, Input, Notice, PageHeader, Table, Td } from "@/components/ui";
import { decrypt } from "@/lib/util";
import { otpauthUrl } from "@/lib/totp";
import { BRAND } from "@/lib/brand";
import { PLANS, billingEnabled } from "@/core/billing";
import { dateShort } from "@/lib/format";
import { confirm2fa, disable2fa, inviteMember, openPortal, removeMember, revokeInvite, saveAgency, start2fa, startCheckout } from "@/app/actions-echipa";

const ROLE: Record<string, string> = { owner: "Proprietar", admin: "Administrator", member: "Membru", viewer: "Doar citire", client: "Client (agenție)" };
const STATUS: Record<string, string> = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", canceled: "Anulat" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ plata?: string; eroare?: string }> }) {
  const { user, org, role, projects } = await currentProject();
  const sp = await searchParams;
  const admin = ["owner", "admin"].includes(role);
  const members = await db.select({ u: schema.users, m: schema.memberships }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id));
  const invites = await db.select().from(schema.invites).where(and(eq(schema.invites.orgId, org.id), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())));
  const pending2fa = !user.totpEnabled && user.totpSecret ? decrypt(user.totpSecret) : null;
  const qr = pending2fa ? await QRCode.toDataURL(otpauthUrl(pending2fa, user.email, org.brandName ?? BRAND.name), { margin: 1, width: 200 }) : null;
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader eyebrow="Cont" title="Echipă, securitate și abonament" subtitle={`${org.name} · ${org.kind === "agency" ? "agenție" : "magazin"}`} />
      {sp.plata && <div className="mb-4"><Notice tone="good">Plata a fost primită. Abonamentul se activează în câteva secunde.</Notice></div>}
      {sp.eroare && <div className="mb-4"><Notice tone="warn">{sp.eroare}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Echipa" className="lg:col-span-2">
          <Table head={["Persoană", "Rol", "Magazine", ""]}>
            {members.map(({ u, m }) => (
              <tr key={u.id}>
                <Td><div className="font-medium">{u.name ?? u.email}</div><div className="text-xs text-muted">{u.email}{u.totpEnabled ? " · 2FA activ" : ""}</div></Td>
                <Td><Badge tone={m.role === "owner" ? "primary" : "muted"}>{ROLE[m.role] ?? m.role}</Badge></Td>
                <Td className="text-xs text-muted">{m.role === "client" ? (m.projectIds ?? []).map((id) => projectName.get(id) ?? "?").join(", ") : "Toate"}</Td>
                <Td>{admin && m.role !== "owner" && u.id !== user.id && <form action={removeMember}><input type="hidden" name="userId" value={u.id} /><button className="text-xs text-muted hover:text-bad">Elimină</button></form>}</Td>
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={i.id}>
                <Td><div className="text-muted">{i.email}</div><div className="text-xs text-muted">invitat, expiră {dateShort(i.expiresAt)}</div></Td>
                <Td><Badge>{ROLE[i.role] ?? i.role}</Badge></Td><Td className="text-xs text-muted">{i.role === "client" ? (i.projectIds ?? []).map((id) => projectName.get(id)).join(", ") : "Toate"}</Td>
                <Td>{admin && <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-muted hover:text-bad">Anulează</button></form>}</Td>
              </tr>
            ))}
          </Table>
          {admin && (
            <ActionForm action={inviteMember} className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
              <Field label="Invită pe email"><Input name="email" type="email" required placeholder="coleg@magazin.ro" /></Field>
              <Field label="Rol">
                <select name="role" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                  <option value="member">Membru</option><option value="admin">Administrator</option><option value="viewer">Doar citire</option>
                  {org.kind === "agency" && <option value="client">Client (vede doar magazinele alese)</option>}
                </select>
              </Field>
              <SubmitButton className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Trimite invitația</SubmitButton>
              {org.kind === "agency" && (
                <fieldset className="sm:col-span-3"><legend className="mb-1 text-xs text-muted">Pentru rolul Client: magazinele pe care le vede</legend>
                  <div className="flex flex-wrap gap-3 text-sm">{projects.map((p) => <label key={p.id} className="flex items-center gap-1.5"><input type="checkbox" name="projectIds" value={p.id} /> {p.name}</label>)}</div>
                </fieldset>
              )}
            </ActionForm>
          )}
        </Card>

        <Card title="Verificare în doi pași">
          {user.totpEnabled ? (
            <>
              <p className="mb-3 text-sm"><Badge tone="good">Activă</Badge> La intrare îți cerem și codul din aplicația de autentificare.</p>
              <ActionForm action={disable2fa} className="flex items-end gap-2"><Field label="Cod pentru dezactivare"><Input name="code" inputMode="numeric" required /></Field><SubmitButton className="rounded-lg border border-border px-3 py-2 text-sm">Oprește</SubmitButton></ActionForm>
            </>
          ) : pending2fa && qr ? (
            <>
              <p className="mb-3 text-sm text-muted">Scanează codul cu Google Authenticator, Microsoft Authenticator sau 1Password, apoi scrie codul de 6 cifre.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Cod QR pentru aplicația de autentificare" width={160} height={160} className="mb-2 rounded-lg bg-white p-1" />
              <p className="mb-3 break-all font-mono text-xs text-muted">Cheie manuală: {pending2fa}</p>
              <ActionForm action={confirm2fa} className="flex items-end gap-2"><Field label="Cod"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required /></Field><SubmitButton className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg">Activează</SubmitButton></ActionForm>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Protejează contul cu un cod din telefon la fiecare intrare. Recomandat pentru toți cei care au acces la cheile API ale magazinului.</p>
              <form action={start2fa}><button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Pornește activarea</button></form>
            </>
          )}
        </Card>

        <Card title="Agenție și marcă proprie">
          <ActionForm action={saveAgency} className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="kind" value="agency" defaultChecked={org.kind === "agency"} disabled={!admin} /> Suntem o agenție și administrăm magazinele clienților</label>
            <Field label="Numele afișat în panou și rapoarte" hint={`Gol = ${BRAND.name}`}><Input name="brandName" defaultValue={org.brandName ?? ""} disabled={!admin} /></Field>
            <Field label="Culoarea principală" hint="Format #0d7a6a"><Input name="brandColor" defaultValue={org.brandColor ?? ""} placeholder="#0d7a6a" disabled={!admin} /></Field>
            {admin && <SubmitButton className="rounded-lg border border-border px-3 py-2 text-sm">Salvează</SubmitButton>}
          </ActionForm>
        </Card>

        <Card title="Abonament" className="lg:col-span-2">
          <p className="mb-4 text-sm">Plan curent: <b>{PLANS.find((p) => p.id === org.plan)?.name ?? "Probă gratuită"}</b> · <Badge tone={org.billingStatus === "active" ? "good" : org.billingStatus === "past_due" ? "bad" : "muted"}>{STATUS[org.billingStatus] ?? org.billingStatus}</Badge>
            {org.trialEndsAt && org.billingStatus === "trialing" && <span className="text-muted"> · proba se termină pe {dateShort(org.trialEndsAt)}</span>}</p>
          {!billingEnabled() && <div className="mb-4"><Notice tone="warn">Plata online se activează după ce adaugi cheile Stripe în configurare. Până atunci, planurile sunt doar afișate.</Notice></div>}
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.id} className={`rounded-xl border p-4 ${org.plan === p.id ? "border-primary" : "border-border"}`}>
                <div className="font-display text-lg font-semibold">{p.name}</div>
                <div className="num mb-3 text-sm text-muted">{p.price} + TVA</div>
                <ul className="mb-4 space-y-1 text-sm">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                {admin && <form action={startCheckout}><input type="hidden" name="plan" value={p.id} /><button disabled={!billingEnabled() || org.plan === p.id && org.billingStatus === "active"} className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg disabled:opacity-40">{org.plan === p.id && org.billingStatus === "active" ? "Planul tău" : "Alege"}</button></form>}
              </div>
            ))}
          </div>
          {admin && org.stripeCustomerId && <form action={openPortal} className="mt-4"><button className="text-sm text-primary underline">Facturi, card și anulare</button></form>}
          <p className="mt-3 text-xs text-muted">Separat de abonament: comisionul pentru vânzările aduse direct de căutarea {BRAND.name} apare pe aceeași factură lunară (vezi Vânzări din AI).</p>
        </Card>
      </div>
    </>
  );
}
