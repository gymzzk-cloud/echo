/**
 * Datele operatorului (firma care răspunde de Echo), cerute de politica de confidențialitate
 * și de formularele directoarelor Claude și ChatGPT. Vin din variabile de mediu, nu din cod.
 */
export function legal() {
  const v = (k: string) => process.env[k]?.trim() || null;
  return {
    company: v("LEGAL_NAME"),
    companyId: v("LEGAL_ID"),
    address: v("LEGAL_ADDRESS"),
    supportEmail: v("SUPPORT_EMAIL"),
    appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  };
}
