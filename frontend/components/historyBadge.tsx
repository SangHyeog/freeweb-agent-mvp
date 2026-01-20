
export function badgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "success":
      return { background: "#e6fffa", color: "#065f46" };
    case "stopped":
      return { background: "#fef3c7", color: "#92400e" };
    case "timeout":
      return { background: "#fee2e2", color: "#991b1b" };
    case "oom":
      return { background: "#fde2e2", color: "#7f1d1d" };
    default:
      return { background: "#eee", color: "#333" };
  }
}

export function statusLabel(status: string) {
  return status.toUpperCase();
}
