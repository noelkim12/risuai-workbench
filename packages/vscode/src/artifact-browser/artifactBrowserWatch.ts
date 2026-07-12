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
 * isEqualOrAncestorPath 함수.
 * 삭제 이벤트 경로가 알려진 artifact root 자체이거나 그 상위 폴더인지 판별함.
 * 폴더 단위 삭제/이동은 폴더 하나의 이벤트만 발생하므로 marker glob 대신 이 비교가 필요함.
 *
 * @param ancestorFsPath - 이벤트가 발생한(삭제된) 경로
 * @param targetFsPath - 알려진 artifact root 경로
 * @param separator - 플랫폼 경로 구분자
 * @returns 같은 경로이거나 상위 폴더면 true
 */
export function isEqualOrAncestorPath(
	ancestorFsPath: string,
	targetFsPath: string,
	separator = "/",
): boolean {
	const trim = (value: string): string =>
		value.endsWith(separator) ? value.slice(0, -separator.length) : value;
	const ancestor = trim(ancestorFsPath);
	const target = trim(targetFsPath);
	return target === ancestor || target.startsWith(ancestor + separator);
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
