export function formatServerDateTime(date: Date | null) {
  if (!date) return "Aún no comprobado";
  return date.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
