/** Copia o FileList na hora. Limpar o input depois esvazia a lista ao vivo. */
export function snapshotSelectedFiles(fileList) {
  return [...(fileList || [])].filter(Boolean);
}
