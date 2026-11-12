export function isMetaAdsetNode(node) {
  return node?.data?.type === 'meta-adset';
}

export function formatAdsetBadge(link) {
  if (!link?.adSetId) return null;
  const name = link.adSetName || link.adSetId;
  return name.length > 20 ? `${name.slice(0, 18)}…` : name;
}
