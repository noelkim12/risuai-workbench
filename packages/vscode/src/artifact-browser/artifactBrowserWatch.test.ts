import { describe, expect, it, vi } from "vitest";
import {
	createDebouncedTrigger,
	type FileSystemWatcherLike,
	isEqualOrAncestorPath,
	type TimerScheduler,
	wireWatcherToTrigger,
} from "./artifactBrowserWatch";

/** Deterministic fake scheduler: records the pending callback and fires on demand. */
function fakeScheduler(): TimerScheduler & {
	flush(): void;
	pending(): number;
} {
	let queued: Array<() => void> = [];
	return {
		set(callback) {
			queued.push(callback);
			return queued.length - 1;
		},
		clear(handle) {
			queued[handle as number] = () => {};
		},
		pending() {
			return queued.filter((cb) => cb.toString() !== "() => {}").length;
		},
		flush() {
			const toRun = queued;
			queued = [];
			for (const cb of toRun) cb();
		},
	};
}

describe("createDebouncedTrigger", () => {
	it("coalesces a burst of triggers into a single refresh", () => {
		const scheduler = fakeScheduler();
		const refresh = vi.fn();
		const debounced = createDebouncedTrigger(refresh, 200, scheduler);

		debounced.trigger();
		debounced.trigger();
		debounced.trigger();
		expect(refresh).not.toHaveBeenCalled();

		scheduler.flush();
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("runs again for a fresh burst after the previous one fired", () => {
		const scheduler = fakeScheduler();
		const refresh = vi.fn();
		const debounced = createDebouncedTrigger(refresh, 200, scheduler);

		debounced.trigger();
		scheduler.flush();
		debounced.trigger();
		scheduler.flush();

		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it("cancels a pending refresh on dispose", () => {
		const scheduler = fakeScheduler();
		const refresh = vi.fn();
		const debounced = createDebouncedTrigger(refresh, 200, scheduler);

		debounced.trigger();
		debounced.dispose();
		scheduler.flush();

		expect(refresh).not.toHaveBeenCalled();
	});
});

describe("isEqualOrAncestorPath", () => {
	it("matches the exact same path", () => {
		expect(isEqualOrAncestorPath("/ws/project", "/ws/project")).toBe(true);
	});

	it("matches an ancestor directory of the target", () => {
		expect(isEqualOrAncestorPath("/ws", "/ws/project")).toBe(true);
		expect(isEqualOrAncestorPath("/ws/project", "/ws/project/lorebooks/entry.risulorebook")).toBe(true);
	});

	it("rejects sibling paths sharing a name prefix", () => {
		expect(isEqualOrAncestorPath("/ws/pro", "/ws/project")).toBe(false);
		expect(isEqualOrAncestorPath("/ws/project", "/ws/project-copy")).toBe(false);
	});

	it("rejects a descendant posing as ancestor", () => {
		expect(isEqualOrAncestorPath("/ws/project/lorebooks", "/ws/project")).toBe(false);
	});

	it("ignores trailing separators on either side", () => {
		expect(isEqualOrAncestorPath("/ws/project/", "/ws/project")).toBe(true);
		expect(isEqualOrAncestorPath("/ws/", "/ws/project/")).toBe(true);
	});

	it("supports windows-style separators", () => {
		expect(isEqualOrAncestorPath("C:\\ws", "C:\\ws\\project", "\\")).toBe(true);
		expect(isEqualOrAncestorPath("C:\\ws\\pro", "C:\\ws\\project", "\\")).toBe(false);
	});
});

describe("wireWatcherToTrigger", () => {
	it("invokes the callback on create, change, and delete events", () => {
		const listeners: Record<"create" | "change" | "delete", () => void> = {
			create: () => {},
			change: () => {},
			delete: () => {},
		};
		const watcher: FileSystemWatcherLike = {
			onDidCreate: (cb) => {
				listeners.create = cb;
				return { dispose: () => {} };
			},
			onDidChange: (cb) => {
				listeners.change = cb;
				return { dispose: () => {} };
			},
			onDidDelete: (cb) => {
				listeners.delete = cb;
				return { dispose: () => {} };
			},
			dispose: () => {},
		};
		const onEvent = vi.fn();

		const disposables = wireWatcherToTrigger(watcher, onEvent);
		expect(disposables).toHaveLength(3);

		listeners.create();
		listeners.change();
		listeners.delete();
		expect(onEvent).toHaveBeenCalledTimes(3);
	});
});
