<script lang="ts">
	import { getAuthenticatedMediaByID, getAuthenticatedMediaURL } from '$lib/media-url';
	import { m } from '$lib/paraglide/messages';
	import { ProtectedIcon, ThemeIcon } from '$lib/themes/icons';
	import GridAltEditor from './grid-alt-editor.svelte';

	interface Props {
		mediaId: string;
		mediaIndex: number;
		mediaCount: number;
		isFirstOfThree: boolean;
		altTexts: Map<string, string>;
		captioningIds: Set<string>;
		editing: boolean;
		isVideoMedia: (mediaId: string) => boolean;
		onRemoveMedia: (mediaIndex: number) => void;
		onAltText: (mediaId: string, alt: string) => void;
		onToggleAlt: () => void;
		onDoneAlt: () => void;
	}

	let {
		mediaId,
		mediaIndex,
		mediaCount,
		isFirstOfThree,
		altTexts,
		captioningIds,
		editing,
		isVideoMedia,
		onRemoveMedia,
		onAltText,
		onToggleAlt,
		onDoneAlt
	}: Props = $props();

	const originalURL = $derived(getAuthenticatedMediaByID(mediaId));
	const thumbURL = $derived(getAuthenticatedMediaURL(`/media/${mediaId}/thumb/md`));
	const posterURL = $derived(getAuthenticatedMediaURL(`/media/${mediaId}/poster`));
	// The composer tile is large, so the 400px thumbnail tier blurs once the
	// image is stretched across the editor column. Show the authored original
	// and keep the thumbnail only as a fallback for originals that fail.
	let showingThumbnail = $state(false);
	let missing = $state(false);

	function handleImageError(): void {
		if (!showingThumbnail) {
			showingThumbnail = true;
			return;
		}
		missing = true;
	}
</script>

<div
	tabindex="-1"
	data-composer-media-id={mediaId}
	class="group/media relative overflow-hidden rounded-lg {isFirstOfThree ? 'col-span-2' : ''}"
>
	{#if missing}
		<div
			class="{mediaCount === 1
				? 'aspect-video'
				: 'aspect-square'} flex w-full items-center justify-center bg-muted"
			role="presentation"
		>
			<ThemeIcon role="image" class="size-8 text-muted-foreground/40" />
		</div>
	{:else if isVideoMedia(mediaId)}
		<video
			src={originalURL}
			poster={posterURL}
			class="{mediaCount === 1 ? 'aspect-video' : 'aspect-square'} w-full object-cover"
			controls
			muted
			playsinline
			preload="metadata"
			onerror={() => (missing = true)}
		></video>
	{:else}
		<img
			src={showingThumbnail ? thumbURL : originalURL}
			alt={altTexts.get(mediaId) || ''}
			class="{mediaCount === 1 ? 'aspect-video' : 'aspect-square'} w-full object-cover"
			onerror={handleImageError}
		/>
	{/if}
	<div
		class="absolute top-2 right-2 flex items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-focus-within/media:opacity-100 md:group-hover/media:opacity-100"
		data-testid="composer-media-actions"
	>
		<button
			type="button"
			class={[
				'flex size-11 items-center justify-center rounded-md bg-black/75 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/90 md:size-7',
				altTexts.get(mediaId) ? 'ring-2 ring-primary/80 ring-offset-1 ring-offset-transparent' : ''
			]}
			aria-label={captioningIds.has(mediaId)
				? m.compose_alt_text_generating()
				: altTexts.get(mediaId)
					? m.media_alt_text()
					: m.media_add_alt_text()}
			title={captioningIds.has(mediaId)
				? m.compose_alt_text_generating()
				: altTexts.get(mediaId)
					? m.media_alt_text()
					: m.media_add_alt_text()}
			onclick={(e) => {
				e.stopPropagation();
				onToggleAlt();
			}}
		>
			{#if captioningIds.has(mediaId)}
				<ProtectedIcon
					icon="loading"
					class="size-4 animate-spin motion-reduce:animate-none md:size-3.5"
				/>
			{:else}
				<ProtectedIcon icon="editor-text" class="size-4 md:size-3.5" />
			{/if}
		</button>
		<button
			type="button"
			class="flex size-11 items-center justify-center rounded-md bg-black/75 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-red-600 md:size-7"
			aria-label={m.compose_remove_media()}
			title={m.compose_remove_media()}
			onclick={(e) => {
				e.stopPropagation();
				onRemoveMedia(mediaIndex);
			}}
		>
			<ThemeIcon role="close" class="size-4 md:size-3.5" />
		</button>
	</div>
	<GridAltEditor
		open={editing}
		{mediaId}
		value={altTexts.get(mediaId) ?? ''}
		captioning={captioningIds.has(mediaId)}
		variant="inline"
		onChange={(next) => onAltText(mediaId, next)}
		onDone={onDoneAlt}
	/>
</div>
