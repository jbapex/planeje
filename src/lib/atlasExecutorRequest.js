export const ATLAS_EXECUTOR_TAG = '[Executor Planeje]\n';
export const ATLAS_EXECUTOR_MESSAGE_LIMIT = 11900;
export const atlasExecutorMessageBody = content => {
  if (typeof content !== 'string') return content;
  if (content.startsWith(ATLAS_EXECUTOR_TAG)) return content.slice(ATLAS_EXECUTOR_TAG.length);
  const titleTag = ATLAS_EXECUTOR_TAG.replace(/\s+/g,' ');
  return content.startsWith(titleTag) ? content.slice(titleTag.length) : content;
};
