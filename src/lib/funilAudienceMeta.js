export const AUDIENCE_PICKER_NODE_TYPES = new Set(['audiencia', 'lookalike']);

export function isAudiencePickerNode(node) {
  return AUDIENCE_PICKER_NODE_TYPES.has(node?.data?.type);
}

export function formatAudienceMetaBadge(audienceMeta) {
  if (!audienceMeta?.customAudienceId) return null;
  const name = audienceMeta.customAudienceName || audienceMeta.customAudienceId;
  return name.length > 22 ? `${name.slice(0, 20)}…` : name;
}
