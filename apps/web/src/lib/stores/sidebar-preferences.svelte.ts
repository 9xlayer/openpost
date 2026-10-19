import { browser } from '$app/environment';
const storageKey = 'openpost-sidebar-calendar';
function savedVisibility(): boolean {
	if (!browser) return true;
	try {
		return localStorage.getItem(storageKey) !== 'false';
	} catch {
		return true;
	}
}
class SidebarPreferences {
	calendarVisible = $state(savedVisibility());
	setCalendarVisible(visible: boolean) {
		this.calendarVisible = visible;
		try {
			localStorage.setItem(storageKey, String(visible));
		} catch {
			// Keep the current session's choice when storage is blocked.
		}
	}
}
export const sidebarPreferences = new SidebarPreferences();
