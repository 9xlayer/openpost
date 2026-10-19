<script lang="ts">
	import { CalendarDate } from '@internationalized/date';
	import { tick, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { schedulingPublicationsQueryOptions } from '@openpost/query-catalog';
	import { queryClient } from '$lib/query/client';
	import { schedulingQueryAPI } from '$lib/query/scheduling';
	import { workspaceClock } from '$lib/components/compose/schedule-timezone';
	import { buildRollingCalendarWeeks } from '$lib/components/sidebar-rolling-calendar';
	import { ui } from '$lib/stores/ui.svelte';
	import { workspaceCtx } from '$lib/stores/workspace.svelte';
	import { publicationInvalidationForWorkspace } from '$lib/publication-invalidation';
	import { publicationCalendarDayKey } from '$lib/publication-calendar';
	import { m } from '$lib/paraglide/messages';
	import { getLocaleTag } from '$lib/i18n';
	import { workspaceColor } from '$lib/workspace-color';
	import { resolveAppPath } from '$lib/app-path';
	let dayCounts = $state.raw(new SvelteMap<string, number>());
	let overviewRequest = 0;
	let overviewWorkspaceKey = '';
	let loadedOverviewMonths = new SvelteSet<string>();
	let pendingOverviewMonths = new SvelteSet<string>();
	let handledInvalidationRevision = 0;
	let renderedWeekCount = $state(12);
	let focusedDayKey = $state('');
	let visibleCalendarDayKey = $state('');
	const weeksPerBatch = 8;
	const calendarWeekHeight = 36;
	const workspaceId = $derived(workspaceCtx.currentWorkspace?.id ?? '');
	const viewerTimeZone = $derived(workspaceCtx.settings.timezone || 'UTC');
	const plannerColor = $derived(
		workspaceCtx.currentWorkspace ? workspaceColor(workspaceCtx.currentWorkspace) : '#f97316'
	);
	const plannerToday = $derived(workspaceClock(viewerTimeZone).date);
	const rollingWeeks = $derived(
		buildRollingCalendarWeeks(plannerToday, workspaceCtx.weekStartsOn, renderedWeekCount)
	);
	const overviewMonthKeys = $derived(plannerOverviewMonths(rollingWeeks));
	const visibleCalendarDate = $derived(
		rollingWeeks.flat().find((day) => day.key === visibleCalendarDayKey)?.date ?? plannerToday
	);
	const visibleCalendarMonth = $derived(formatCalendarMonth(visibleCalendarDate));
	const keyboardFocusDayKey = $derived.by(() => {
		const focusedDay = rollingWeeks.flat().find((day) => day.key === focusedDayKey && !day.past);
		return focusedDay?.key ?? plannerToday.toString();
	});
	$effect(() => {
		const currentWorkspaceId = workspaceId;
		const workspaceKey = `${currentWorkspaceId}|${viewerTimeZone}`;
		const months = overviewMonthKeys;
		untrack(() => void loadOverviewMonths(currentWorkspaceId, workspaceKey, months));
	});

	$effect(() => {
		const batch = ui.publicationInvalidations;
		if (batch.revision === 0 || batch.revision === handledInvalidationRevision) return;
		handledInvalidationRevision = batch.revision;
		untrack(() => {
			const currentWorkspaceId = workspaceId;
			if (!currentWorkspaceId) return;
			const invalidation = publicationInvalidationForWorkspace(batch, currentWorkspaceId);
			if (!invalidation?.scopes.includes('calendar')) return;
			const months =
				invalidation.dateKeys.length > 0
					? [...new Set(invalidation.dateKeys.map((key) => key.slice(0, 7)))]
					: overviewMonthKeys;
			void loadOverviewMonths(
				currentWorkspaceId,
				`${currentWorkspaceId}|${viewerTimeZone}`,
				[...new Set([...overviewMonthKeys, ...months])],
				months
			);
		});
	});
	async function loadOverviewMonths(
		currentWorkspaceId: string,
		workspaceKey: string,
		months: string[],
		invalidateMonths: string[] = []
	) {
		if (!currentWorkspaceId) {
			dayCounts = new SvelteMap();
			overviewWorkspaceKey = '';
			loadedOverviewMonths = new SvelteSet();
			pendingOverviewMonths = new SvelteSet();
			return;
		}
		if (overviewWorkspaceKey !== workspaceKey) {
			overviewRequest++;
			dayCounts = new SvelteMap();
			overviewWorkspaceKey = workspaceKey;
			loadedOverviewMonths = new SvelteSet();
			pendingOverviewMonths = new SvelteSet();
		}
		if (invalidateMonths.length > 0) {
			overviewRequest++;
			loadedOverviewMonths = new SvelteSet(
				[...loadedOverviewMonths].filter((month) => !invalidateMonths.includes(month))
			);
			pendingOverviewMonths = new SvelteSet();
		}
		const request = overviewRequest;
		const requestedMonths = months.filter(
			(month) => !loadedOverviewMonths.has(month) && !pendingOverviewMonths.has(month)
		);
		if (requestedMonths.length === 0) return;
		for (const month of requestedMonths) pendingOverviewMonths.add(month);
		try {
			const overviews = await Promise.all(
				requestedMonths.map(async (month): Promise<[string, Map<string, number>]> => {
					const range = publicationMonthRange(month, viewerTimeZone);
					const counts = new Map<string, number>();
					const options = schedulingPublicationsQueryOptions(
						schedulingQueryAPI,
						currentWorkspaceId,
						{
							calendarFrom: range.from,
							calendarBefore: range.before,
							limit: 200,
							allPages: true
						}
					);
					if (invalidateMonths.includes(month)) {
						await queryClient.invalidateQueries({
							queryKey: options.queryKey,
							exact: true,
							refetchType: 'none'
						});
					}
					for (const publication of await queryClient.query(options)) {
						const dayKey = publicationCalendarDayKey(publication, viewerTimeZone);
						if (dayKey?.startsWith(`${month}-`)) {
							counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
						}
					}
					return [month, counts];
				})
			);
			if (request !== overviewRequest || overviewWorkspaceKey !== workspaceKey) return;
			const nextCounts = new SvelteMap(dayCounts);
			for (const [month, counts] of overviews) {
				for (const dateKey of [...nextCounts.keys()]) {
					if (dateKey.startsWith(`${month}-`)) nextCounts.delete(dateKey);
				}
				for (const [dateKey, count] of counts) nextCounts.set(dateKey, count);
				loadedOverviewMonths.add(month);
			}
			dayCounts = nextCounts;
		} catch {
			// Keep the last successful planner state visible during a background refresh.
		} finally {
			if (request === overviewRequest) {
				for (const month of requestedMonths) pendingOverviewMonths.delete(month);
			}
		}
	}

	function openPlannerDay(date: CalendarDate) {
		focusedDayKey = date.toString();
		ui.openDayPosts(date);
	}

	async function moveCalendarFocus(event: KeyboardEvent, date: CalendarDate) {
		const eventTarget = event.currentTarget;
		if (!(eventTarget instanceof HTMLElement)) return;
		const grid = eventTarget.closest('[role="grid"]');
		const days = rollingWeeks.flat();
		const currentIndex = days.findIndex((day) => day.key === date.toString());
		if (currentIndex < 0) return;

		let nextIndex: number;
		switch (event.key) {
			case 'ArrowLeft':
				nextIndex = currentIndex - 1;
				break;
			case 'ArrowRight':
				nextIndex = currentIndex + 1;
				break;
			case 'ArrowUp':
				nextIndex = currentIndex - 7;
				break;
			case 'ArrowDown':
				nextIndex = currentIndex + 7;
				break;
			case 'Home':
				nextIndex = currentIndex - (currentIndex % 7);
				break;
			case 'End':
				nextIndex = currentIndex + (6 - (currentIndex % 7));
				break;
			default:
				return;
		}

		event.preventDefault();
		nextIndex = Math.max(0, nextIndex);
		const todayIndex = days.findIndex((day) => day.today);
		if (todayIndex >= 0) nextIndex = Math.max(todayIndex, nextIndex);
		if (nextIndex >= days.length) {
			renderedWeekCount += weeksPerBatch;
			await tick();
		}

		const target = rollingWeeks.flat()[nextIndex];
		if (!target || target.past) return;
		focusedDayKey = target.key;
		await tick();
		grid?.querySelector<HTMLButtonElement>(`button[data-calendar-date="${target.key}"]`)?.focus();
	}

	function loadMoreWeeks(event: Event) {
		const calendar = event.currentTarget;
		if (!(calendar instanceof HTMLElement)) return;
		const visibleWeekIndex = Math.min(
			rollingWeeks.length - 1,
			Math.max(0, Math.floor((calendar.scrollTop + calendarWeekHeight / 2) / calendarWeekHeight))
		);
		const visibleWeek = rollingWeeks[visibleWeekIndex];
		visibleCalendarDayKey =
			visibleWeek?.find((day) => day.today)?.key ?? visibleWeek?.[3]?.key ?? '';

		const remaining = calendar.scrollHeight - calendar.scrollTop - calendar.clientHeight;
		if (remaining <= 72) renderedWeekCount += weeksPerBatch;
	}

	function formatCalendarMonth(date: CalendarDate) {
		return date.toDate(viewerTimeZone).toLocaleDateString(getLocaleTag(), {
			month: 'long',
			year: 'numeric',
			timeZone: viewerTimeZone
		});
	}

	function plannerOverviewMonths(weeks: ReturnType<typeof buildRollingCalendarWeeks>) {
		return [...new Set(weeks.flat().map((day) => day.key.slice(0, 7)))];
	}

	function publicationMonthRange(month: string, timeZone: string) {
		const [year, monthNumber] = month.split('-').map(Number);
		const start = new CalendarDate(year, monthNumber, 1);
		return {
			from: start.toDate(timeZone).toISOString(),
			before: start.add({ months: 1 }).toDate(timeZone).toISOString()
		};
	}

	function formatWeekday(date: CalendarDate) {
		return date
			.toDate(viewerTimeZone)
			.toLocaleDateString(getLocaleTag(), { weekday: 'short', timeZone: viewerTimeZone })
			.slice(0, 2);
	}

	function formatDayLabel(date: CalendarDate) {
		return date.toDate(viewerTimeZone).toLocaleDateString(getLocaleTag(), {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: viewerTimeZone
		});
	}
</script>

<section
	class="shrink-0 border-b border-sidebar-border px-2 pb-3"
	aria-label={m.sidebar_calendar()}
>
	<div class="flex h-8 items-center justify-between px-2 [@media(pointer:coarse)]:hidden">
		<span
			class="truncate text-sm font-semibold text-sidebar-foreground/88"
			data-testid="sidebar-calendar-month"
		>
			{visibleCalendarMonth}
		</span>
		<button
			type="button"
			class="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
			onclick={() => openPlannerDay(plannerToday)}
		>
			{m.common_today()}
		</button>
	</div>
	<div
		class="sidebar-calendar-scrollbar overflow-y-auto overscroll-contain select-none [@media(pointer:coarse)]:hidden"
		data-testid="sidebar-rolling-calendar"
		onscroll={loadMoreWeeks}
	>
		<div role="grid" aria-label={m.calendar_label()} class="relative">
			<div
				role="row"
				class="sticky top-0 z-10 grid h-8 grid-cols-7 items-center bg-sidebar pt-1"
				data-testid="sidebar-calendar-weekdays"
			>
				{#each rollingWeeks[0] ?? [] as day (day.key)}
					<span
						role="columnheader"
						class="text-center text-xs font-normal text-sidebar-foreground/70"
					>
						{formatWeekday(day.date)}
					</span>
				{/each}
			</div>

			{#each rollingWeeks as week (week[0]?.key)}
				<div role="row" class="grid h-9 grid-cols-7 items-center">
					{#each week as day (day.key)}
						<div role="gridcell" class="flex items-center justify-center">
							<button
								type="button"
								data-calendar-date={day.key}
								class={[
									'relative inline-flex size-7 items-center justify-center rounded-md text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
									day.today
										? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
										: day.past
											? 'cursor-not-allowed text-sidebar-foreground/28'
											: 'text-sidebar-foreground/88 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
								]}
								disabled={day.past}
								tabindex={day.key === keyboardFocusDayKey ? 0 : -1}
								aria-label={formatDayLabel(day.date)}
								aria-current={day.today ? 'date' : undefined}
								onclick={() => openPlannerDay(day.date)}
								onfocus={() => (focusedDayKey = day.key)}
								onkeydown={(event) => void moveCalendarFocus(event, day.date)}
							>
								{day.date.day}
								{#if (dayCounts.get(day.key) ?? 0) > 0}
									<span
										class="pointer-events-none absolute bottom-0.5 size-1 rounded-full ring-1 ring-sidebar"
										style:background-color={plannerColor}
										aria-hidden="true"
									></span>
								{/if}
							</button>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
	<a
		class="hidden min-h-11 items-center rounded-md px-2 text-sm hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring [@media(pointer:coarse)]:flex"
		href={resolveAppPath('/calendar')}>{m.sidebar_calendar()}</a
	>
</section>

<style>
	.sidebar-calendar-scrollbar {
		height: clamp(4.25rem, calc(100dvh - 34rem), 10.25rem);
		scrollbar-width: thin;
		scrollbar-color: color-mix(in oklch, var(--sidebar-foreground) 22%, transparent) transparent;
	}
</style>
