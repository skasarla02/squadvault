export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function formatDeadline(iso: string) {
  const deadline = new Date(iso);
  const diffMs = deadline.getTime() - Date.now();
  const absHours = Math.abs(diffMs) / 36e5;

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absHours < 48) {
    return rtf.format(Math.round(diffMs / 36e5), "hour");
  }
  return rtf.format(Math.round(diffMs / 864e5), "day");
}
