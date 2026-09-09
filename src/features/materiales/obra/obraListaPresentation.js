export const OBRA_PAGE_SIZE = 50;

export const obraThemeScope = { "--amber": "var(--violet)", "--amber-soft": "var(--violet-soft)", "--amber-border": "var(--violet-border)", "--amber-deep": "var(--violet-deep)" };

// Presentation only: never change the source rows or the order used by purchases.
export function paginateObraGroups(groups, requestedPage, pageSize = OBRA_PAGE_SIZE) {
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.trunc(Number(requestedPage)) || 1));
  const start = (page - 1) * pageSize;
  let offset = 0;
  const pageGroups = [];
  for (const group of groups) {
    const from = Math.max(0, start - offset);
    const to = Math.min(group.rows.length, start + pageSize - offset);
    if (to > from) pageGroups.push({ ...group, rows: group.rows.slice(from, to), allRows: group.rows, offset: offset + from });
    offset += group.rows.length;
  }
  return { groups: pageGroups, page, pageCount, total, start: total ? start + 1 : 0, end: Math.min(start + pageSize, total) };
}

export function toggleObraSelection(selected, rows) {
  const next = new Set(selected);
  const remove = rows.length > 0 && rows.every((row) => next.has(row.id));
  rows.forEach((row) => remove ? next.delete(row.id) : next.add(row.id));
  return next;
}

export function obraPageNumbers(page, pageCount) {
  return [...new Set([1, page - 1, page, page + 1, pageCount])].filter((number) => number > 0 && number <= pageCount).sort((a, b) => a - b);
}
