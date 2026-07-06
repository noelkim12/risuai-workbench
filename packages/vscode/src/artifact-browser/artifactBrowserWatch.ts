/**
 * Filesystem-watch wiring helpers for the Artifact Browser.
 *
 * The artifact browser rebuilds its card list and detail sections by scanning
 * the workspace on demand. External file mutations (git, terminal, another
 * editor) produce no in-extension event, so the list would otherwise go stale
 * until a manual refresh. These helpers translate raw watcher events into a
 * single debounced refresh call.
 *
 * The wiring is kept free of `vscode` imports so the coalescing behaviour can
 * be unit-tested without an extension host.
 *
 * @file packages/vscode/src/artifact-browser/artifactBrowserWatch.ts
 */

/** Minimal disposable contract shared with `vscode.Disposable`. */
export interface DisposableLike {
	dispose(): void;
}

/** Subset of `vscode.FileSystemWatcher` the wiring depends on. */
export interface FileSystemWatcherLike extends DisposableLike {
	onDidCreate(listener: () => void): DisposableLike;
	onDidChange(listener: () => void): DisposableLike;
	onDidDelete(listener: () => void): DisposableLike;
}

/** Injectable timer surface so tests can drive coalescing deterministically. */
export interface TimerScheduler {
	set(callback: () => void, delayMs: number): unknown;
	clear(handle: unknown): void;
}

const defaultScheduler: TimerScheduler = {
	set: (callback, delayMs) => setTimeout(callback, delayMs),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A refresh trigger that coalesces bursts of calls into a single trailing
 * invocation. Bulk operations (git checkout, extracting an archive) emit many
 * events in quick succession; without coalescing every event would kick off a
 * full workspace rescan.
 */
export interface DebouncedTrigger extends DisposableLike {
	/** Schedule (or reschedule) the trailing refresh. */
	trigger(): void;
}

/**
 * createDebouncedTrigger 함수.
 * `refresh`를 `delayMs` 동안의 마지막 호출 기준 한 번만 실행하도록 coalesce함.
 *
 * @param refresh - 실제로 실행할 refresh 콜백
 * @param delayMs - 마지막 trigger 이후 대기 시간(ms)
 * @param scheduler - 테스트에서 주입 가능한 timer surface
 * @returns trigger/dispose를 가진 debounced trigger
 */
export function createDebouncedTrigger(
	refresh: () => void,
	delayMs: number,
	scheduler: TimerScheduler = defaultScheduler,
): DebouncedTrigger {
	let handle: unknown;
	return {
		trigger() {
			if (handle !== undefined) scheduler.clear(handle);
			handle = scheduler.set(() => {
				handle = undefined;
				refresh();
			}, delayMs);
		},
		dispose() {
			if (handle !== undefined) {
				scheduler.clear(handle);
				handle = undefined;
			}
		},
	};
}

/**
 * wireWatcherToTrigger 함수.
 * watcher의 create/change/delete 이벤트를 모두 하나의 trigger로 연결함.
 *
 * @param watcher - 연결할 filesystem watcher
 * @param onEvent - 각 이벤트에서 호출할 콜백(보통 debounced trigger)
 * @returns 등록된 이벤트 구독 disposable 목록
 */
export function wireWatcherToTrigger(
	watcher: FileSystemWatcherLike,
	onEvent: () => void,
): DisposableLike[] {
	return [
		watcher.onDidCreate(onEvent),
		watcher.onDidChange(onEvent),
		watcher.onDidDelete(onEvent),
	];
}
