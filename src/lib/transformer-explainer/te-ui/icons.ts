// @ts-nocheck
// Shim mapping the flowbite-svelte-icons names the ported components use onto
// their lucide equivalents (LangX already depends on @lucide/svelte). Import
// path is swapped from 'flowbite-svelte-icons' to this; the named imports in the
// components stay untouched.
export {
	ChevronLeft as AngleLeftOutline,
	ChevronRight as AngleRightOutline,
	ArrowRight as ArrowRightOutline,
	Maximize2 as ArrowUpRightDownLeftOutline,
	ChevronDown as ChevronDownOutline,
	X as CloseOutline,
	Eye as EyeOutline,
	ZoomIn as ZoomInOutline
} from '@lucide/svelte';
