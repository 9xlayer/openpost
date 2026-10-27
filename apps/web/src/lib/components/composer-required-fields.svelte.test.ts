import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { SocialAccount } from '$lib/api/client';
import type { components } from '$lib/api/types';
import '../../routes/layout.css';
import ComposerRequiredFields from './composer-required-fields.svelte';

type ResolvedAccountCapability = components['schemas']['ResolvedAccountCapability'];
type ProviderReadinessDecision = components['schemas']['Decision'];
type SettingDefinition = components['schemas']['SettingDefinition'];

const discordAccount: SocialAccount = {
	id: 'discord-bot',
	slug: 'discord-bot',
	platform: 'discord_bot',
	account_id: 'guild-1',
	account_username: 'OpenPost bot',
	account_avatar_url: '',
	instance_url: '',
	is_active: true,
	thread_replies_supported: true,
	messaging_supported: true,
	messages_enabled: false,
	grant_destination_count: 1,
	shared_grant: false
};

function channelSetting(): SettingDefinition {
	return {
		key: 'channel_id',
		message_key: 'publishing.setting.channel_id',
		label: 'Channel',
		group: 'content',
		control: 'remote_picker',
		type: 'select',
		scope: 'destination',
		intents: ['post'],
		output_profiles: ['discord.post'],
		media_shapes: ['text'],
		required: true,
		required_policy: 'always',
		options_source: 'discord_channels',
		constraints: {}
	};
}

function healthyReadiness(): ProviderReadinessDecision {
	return {
		advertisable: true,
		connectable: true,
		analytics_ready: true,
		discoverable: true,
		executable: true,
		observable: true,
		facts: {
			approval: 'approved',
			authorization: 'authorized',
			configuration: 'configured',
			control: 'enabled',
			live_certification: 'passed',
			local_test: 'passed',
			policy: 'allowed'
		},
		publishable: true,
		state: 'healthy'
	};
}

function capability(setting: SettingDefinition): ResolvedAccountCapability {
	return {
		account_id: discordAccount.id,
		content: {
			body: { required: false },
			title: { required: false },
			description: { required: false },
			alt_text: { required: false }
		},
		active_constraints: {},
		available_formats: [],
		capability_revision: 'test',
		compatible: true,
		format_selection_required: false,
		immediate_readiness: healthyReadiness(),
		intents: ['post'],
		issues: [],
		label: 'Discord channel',
		media: {
			min_count: 0,
			max_count: 10,
			allowed_mimes: [],
			requires_public_url: false,
			requires_https_fetchable: false
		},
		media_shapes: ['text'],
		native_scheduling: false,
		openpost_queued: true,
		output_profile: 'discord.post',
		profile: 'post',
		provider: 'discord_bot',
		requires_app_review: false,
		requires_public_media: false,
		scheduled_readiness: healthyReadiness(),
		segment_strategy: 'preserve',
		setting_groups: [{ key: 'content', settings: [setting] }]
	};
}

it('keeps a lone required channel label left and select right', async () => {
	await page.viewport(390, 844);
	const secondAccount: SocialAccount = {
		...discordAccount,
		id: 'discord-bot-2',
		slug: 'discord-bot-2',
		account_id: 'guild-2'
	};
	const screen = await render(ComposerRequiredFields, {
		props: {
			accounts: [discordAccount],
			resolvedByAccount: { [discordAccount.id]: capability(channelSetting()) },
			valuesByAccount: {},
			optionGroupsByAccount: {
				[discordAccount.id]: { discord_channels: [{ value: 'general', label: '#general' }] }
			},
			onChange: vi.fn(),
			onFormatChange: vi.fn(),
			onAddMedia: vi.fn()
		}
	});
	const loneSelect = screen.getByRole('button', { name: /Channel/ });
	await expect.element(loneSelect).toBeVisible();
	const loneLabel = document.querySelector<HTMLLabelElement>(
		'label[for="required-discord-bot-channel_id"]'
	);
	const loneRow = loneLabel?.parentElement;
	if (!loneLabel || !loneRow) throw new Error('expected the lone required field row');
	const loneLabelBounds = loneLabel.getBoundingClientRect();
	const loneSelectBounds = loneSelect.element().getBoundingClientRect();
	const loneRowBounds = loneRow.getBoundingClientRect();

	// The lone label and its select share a row, with the select pinned to the
	// right edge and sized by its content rather than the row.
	expect(
		Math.abs(
			loneLabelBounds.top +
				loneLabelBounds.height / 2 -
				(loneSelectBounds.top + loneSelectBounds.height / 2)
		)
	).toBeLessThanOrEqual(2);
	expect(loneSelectBounds.width).toBeLessThan(loneRowBounds.width);
	expect(loneLabelBounds.right).toBeLessThanOrEqual(loneSelectBounds.left);
	expect(Math.abs(loneRowBounds.right - loneSelectBounds.right)).toBeLessThanOrEqual(1);
	expect(loneSelectBounds.right).toBeLessThanOrEqual(390);
	expect(loneRowBounds.right).toBeLessThanOrEqual(390);

	// A second required field leaves the general branch, which stacks each
	// label above its select while the same select keeps its intrinsic width.
	await screen.rerender({
		accounts: [discordAccount, secondAccount],
		resolvedByAccount: {
			[discordAccount.id]: capability(channelSetting()),
			[secondAccount.id]: { ...capability(channelSetting()), account_id: secondAccount.id }
		},
		valuesByAccount: {},
		optionGroupsByAccount: {
			[discordAccount.id]: { discord_channels: [{ value: 'general', label: '#general' }] },
			[secondAccount.id]: { discord_channels: [{ value: 'general', label: '#general' }] }
		},
		onChange: vi.fn(),
		onFormatChange: vi.fn(),
		onAddMedia: vi.fn()
	});
	const stackedSelects = screen.getByRole('button', { name: /Channel/ }).elements();
	expect(stackedSelects).toHaveLength(2);
	const stackedSelect = stackedSelects[0];
	await expect.element(stackedSelect).toBeVisible();
	const stackedLabel = document.querySelector<HTMLLabelElement>(
		'label[for="required-discord-bot-channel_id"]'
	);
	if (!stackedLabel) throw new Error('expected the first stacked label');
	const stackedLabelBounds = stackedLabel.getBoundingClientRect();
	const stackedSelectBounds = stackedSelect.getBoundingClientRect();
	expect(stackedSelectBounds.top).toBeGreaterThanOrEqual(stackedLabelBounds.bottom - 1);
	expect(Math.abs(stackedSelectBounds.width - loneSelectBounds.width)).toBeLessThanOrEqual(1);
});
