import { describe, expect, it } from 'vitest';
import { offlineTranslations } from './offline-translations';
import { getLocaleTag, localeLabels } from './i18n';

describe('locale formatting', () => {
	it('uses Russian conventions and offers Russian offline recovery', () => {
		const locale = getLocaleTag('ru');
		expect(localeLabels.ru).toBe('Русский');
		expect(new Intl.NumberFormat(locale).format(12345.6)).toBe('12\u00a0345,6');
		expect(
			new Intl.DateTimeFormat(locale, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC'
			}).format(new Date('2026-10-14T12:00:00Z'))
		).toBe('14 октября 2026 г.');
		expect(offlineTranslations.ru).toEqual([
			'Нет подключения',
			'Эта страница пока недоступна на этом устройстве. Подключитесь к интернету, чтобы открыть её. Сохранённые локальные проекты остаются на устройстве.',
			'Попробовать ещё раз'
		]);
	});
	it('uses Italian conventions for numbers and dates', () => {
		const locale = getLocaleTag('it');

		expect(new Intl.NumberFormat(locale).format(12345.6)).toBe('12.345,6');
		expect(
			new Intl.DateTimeFormat(locale, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC'
			}).format(new Date('2026-10-14T12:00:00Z'))
		).toBe('14 ottobre 2026');
	});
});
