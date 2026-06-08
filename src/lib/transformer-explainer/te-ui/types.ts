// @ts-nocheck
// Local stand-in for flowbite-svelte's PopoverProps — just the fields the ported
// popover components reference for typing. Import path swapped from
// 'flowbite-svelte/Popover.svelte' to this.
export type PopoverProps = {
	offset?: number;
	class?: string;
	triggeredBy?: string;
	trigger?: 'hover' | 'click';
	placement?: string;
	title?: string;
	open?: boolean;
	reference?: unknown;
};
