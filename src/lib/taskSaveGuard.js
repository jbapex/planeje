// The synchronous guard also covers clicks made before React has rendered new state.
export function createTaskSaveGuard(initialStatus) {
  let version = 0;
  let state = { status: initialStatus, validatedStatus: initialStatus, pending: false, error: '', saving: false };
  return {
    snapshot: () => ({ ...state }),
    beginValidation(status) {
      if (state.saving) return null;
      state = { ...state, status, pending: true, error: '' };
      return ++version;
    },
    finishValidation(token, error = '') {
      if (token !== version) return false;
      state = { ...state, pending: false, error };
      if (!error) state.validatedStatus = state.status;
      return true;
    },
    beginSave(status) {
      if (state.pending || state.error || state.saving || status !== state.validatedStatus) return false;
      state = { ...state, saving: true };
      return true;
    },
    finishSave() {
      state = { ...state, saving: false };
    },
    invalidate() {
      version += 1;
    },
  };
}
