export interface NotificationVisibilityState {
  readonly pageVisible: boolean;
  readonly panelOpen: boolean;
  readonly iframeFocused: boolean;
}

export function isNotificationVisible(state: NotificationVisibilityState): boolean {
  return state.pageVisible && (!state.panelOpen || state.iframeFocused);
}
