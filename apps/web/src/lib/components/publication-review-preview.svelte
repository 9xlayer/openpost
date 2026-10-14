<script lang="ts">
	import type { components } from '$lib/api/types';
	import type { SocialAccount } from '$lib/api/client';
	import { buildComposerPreview } from '$lib/compose-preview';
	import type { ComposerSettings, ComposerSettingValue } from './compose/modes';
	import ComposerPreview from './composer-preview.svelte';
	import { getPlatformName } from '$lib/utils';
	import { getLocaleTag } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages';
	import { z } from 'zod';
	import { createQuery } from '@tanstack/svelte-query';
	import { capabilityCatalogQueryOptions } from '@openpost/query-catalog';
	import { queryAPI } from '$lib/query/api';
	import { settingLabel } from '$lib/setting-label';
	let {
		publication,
		accounts
	}: { publication: components['schemas']['PublicationResponse']; accounts: SocialAccount[] } =
		$props();
	const catalog = createQuery(() => capabilityCatalogQueryOptions(queryAPI));
	function settingRows(rendition: components['schemas']['RenditionResponse']) {
		const definitions =
			catalog.data?.capabilities?.find(
				(item) =>
					item.provider === rendition.platform && item.output_profile === rendition.output_profile
			)?.settings ?? [];
		return Object.entries(rendition.settings ?? {}).flatMap(([key, value]) => {
			if (value === null || value === undefined || value === '' || typeof value === 'object')
				return [];
			const definition = definitions.find((item) => item.key === key);
			return [
				{
					key,
					label: definition ? settingLabel(definition) : key.replaceAll('_', ' '),
					value:
						typeof value === 'boolean'
							? value
								? m.compose_setting_yes()
								: m.compose_setting_no()
							: String(value)
				}
			];
		});
	}
	const valueSchema = z.union([
		z.null(),
		z.string(),
		z.number(),
		z.boolean(),
		z.array(z.string()),
		z.array(z.number()),
		z.array(z.boolean())
	]);
	function settings(value: Record<string, unknown> | null | undefined): ComposerSettings {
		const entries: Array<[string, ComposerSettingValue]> = [];
		for (const [key, item] of Object.entries(value ?? {})) {
			const parsed = valueSchema.safeParse(item);
			if (parsed.success) entries.push([key, parsed.data]);
		}
		return Object.fromEntries(entries);
	}
	function time(value: string) {
		return new Intl.DateTimeFormat(getLocaleTag(), {
			dateStyle: 'medium',
			timeStyle: 'long'
		}).format(new Date(value));
	}
</script>

<div class="grid min-w-0 gap-5">
	{#each publication.renditions ?? [] as rendition (rendition.id)}
		{@const account = accounts.find((item) => item.id === rendition.social_account_id)}
		<section class="grid min-w-0 gap-2">
			<h3 class="text-sm font-semibold">
				{account?.alias || account?.account_username || getPlatformName(rendition.platform)} · {getPlatformName(
					rendition.platform
				)}
			</h3>
			<p class="text-xs text-muted-foreground">
				{rendition.schedule_override || publication.scheduled_at
					? time(rendition.schedule_override || publication.scheduled_at!)
					: m.review_timing_later()}
			</p>
			{#if account}
				<ComposerPreview
					model={buildComposerPreview({
						account,
						mode: (rendition.segments?.length ?? 0) > 1 ? 'thread' : 'post',
						outputProfile: rendition.output_profile,
						title: rendition.title,
						subtitle: rendition.description,
						destinationSettings: settings(rendition.settings),
						segments: (rendition.segments ?? []).map((segment) => ({
							id: segment.id,
							text: segment.body,
							url: segment.url,
							settings: settings(segment.settings),
							media: (segment.output_media ?? segment.media ?? []).map((media) => ({
								id: media.id,
								mimeType: media.mime_type,
								altText: media.alt_text,
								aspectRatio: media.height ? media.width / media.height : undefined,
								settings: settings(media.settings ?? {})
							}))
						}))
					})}
				/>
			{:else}
				<p class="whitespace-pre-wrap">{rendition.body}</p>
				<p class="text-sm text-destructive">{m.review_account_missing()}</p>
			{/if}
			{#if Object.keys(rendition.settings ?? {}).length}
				<dl class="grid gap-2 text-sm">
					{#each settingRows(rendition) as row (row.key)}
						<div class="grid min-w-0 gap-1">
							<dt class="font-medium">{row.label}</dt>
							<dd class="break-words whitespace-pre-wrap">{row.value}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</section>
	{/each}
</div>
