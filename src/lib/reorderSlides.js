/** Move um slide sem alterar a lista quando a posição é a mesma ou inválida. */
export function reorderSlides(slides, from, to) {
  const list = Array.isArray(slides) ? slides : [];
  const start = Number(from);
  const end = Number(to);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return list;
  if (start < 0 || end < 0 || start >= list.length || end >= list.length || start === end) return list;
  const next = list.slice();
  const [item] = next.splice(start, 1);
  next.splice(end, 0, item);
  return next;
}
