export function Streaks({ items }: { items: { key?: string; label: string; value: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="streak-grid">
      {items.map(({ key, label, value }) => (
        <section className="panel streak" key={key ?? label}>
          <p>{label}</p>
          <strong>{value}</strong>
        </section>
      ))}
    </div>
  );
}
