type ServerResultsLabelArgs = {
  page: number;
  pageSize: number;
  visibleCount: number;
  totalCount: number;
};

export function getServerResultsSummary({ page, pageSize, visibleCount, totalCount }: ServerResultsLabelArgs) {
  const start = Math.max(1, (page - 1) * pageSize + 1);
  const end = Math.min(start + visibleCount - 1, totalCount);

  return {
    rangeLabel: start === end ? String(start) : `${start}–${end}`,
    totalCount,
    serverLabel: totalCount === 1 ? "servidor" : "servidores",
  };
}

export function formatServerResultsLabel({ page, pageSize, visibleCount, totalCount }: ServerResultsLabelArgs) {
  const { rangeLabel, serverLabel } = getServerResultsSummary({ page, pageSize, visibleCount, totalCount });

  return `Mostrando ${rangeLabel} de ${totalCount} ${serverLabel}`;
}
