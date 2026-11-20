/** Se arată imediat la schimbarea paginii din meniu, până vin datele. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Se încarcă">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-border" />
      <div className="h-40 animate-pulse rounded-xl bg-border/60" />
      <div className="h-64 animate-pulse rounded-xl bg-border/60" />
    </div>
  );
}
