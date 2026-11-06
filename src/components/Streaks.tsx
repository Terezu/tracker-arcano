export interface StreakItem {
  key?: string;
  label: string;
  value: number;
  detail?: string;
}
export function Streaks({ items }: { items: StreakItem[] }) {
  if (!items.length) return null;
  return (
    <div className="streak-grid">
      {items.map(({ key, label, value, detail }) => (
        <section className="panel streak" key={key ?? label}>
          <p>{label}</p>
          <strong>{value}</strong>
          {detail && <small>{detail}</small>}
        </section>
      ))}
    </div>
  );
}
