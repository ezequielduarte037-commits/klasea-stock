export function Skeleton({ width = "100%", height = 14, radius = 6, style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width, height,
        borderRadius: radius,
        background: "linear-gradient(90deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.045) 100%)",
        backgroundSize: "200% 100%",
        animation: "sk-shimmer 1.3s linear infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonStyles() {
  return (
    <style>{`
      @keyframes sk-shimmer {
        0%   { background-position:  200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  );
}

export function CardSkeleton() {
  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      background: "rgba(255,255,255,0.025)",
      padding: "12px 14px",
      display: "grid",
      gap: 8,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Skeleton width={9} height={9} radius={99} />
        <Skeleton width="58%" height={13} />
        <span style={{ flex: 1 }} />
        <Skeleton width={42} height={14} radius={5} />
      </div>
      <Skeleton width="38%" height={10} />
      <Skeleton width="86%" height={11} />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <Skeleton width={50} height={14} radius={5} />
        <span style={{ flex: 1 }} />
        <Skeleton width={28} height={10} />
      </div>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div style={{
      borderLeft: "3px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.025)",
      borderRadius: 7,
      padding: "10px 13px",
      display: "grid",
      gridTemplateColumns: "1fr auto auto",
      alignItems: "center",
      gap: 10,
    }}>
      <div style={{ display: "grid", gap: 4 }}>
        <Skeleton width="60%" height={12} />
        <Skeleton width="35%" height={10} />
      </div>
      <Skeleton width={60} height={16} radius={5} />
      <Skeleton width={56} height={10} />
    </div>
  );
}
