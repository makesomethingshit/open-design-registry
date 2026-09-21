export type RowTaskState = Record<string, boolean>;
export type RowMessageState = Record<string, string>;

export function setRowBusy(state: RowTaskState, id: string, busy: boolean): RowTaskState {
  return { ...state, [id]: busy };
}

export function setRowMessage(state: RowMessageState, id: string, message: string): RowMessageState {
  return { ...state, [id]: message };
}
