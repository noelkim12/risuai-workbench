/**
 * Per-document main editor edit queue.
 * @file packages/vscode/src/editors/mainEditor/mainEditorEditQueue.ts
 */

export class MainEditorEditQueue {
  private readonly editQueues = new Map<string, Promise<void>>();

  /**
   * enqueue 함수.
   * 같은 document URI의 edit task를 직렬화하고 실패 뒤에도 다음 task를 실행함.
   *
   * @param documentUri - edit queue를 나눌 TextDocument URI
   * @param task - 직렬 실행할 edit task
   * @returns task 완료 또는 실패를 반영하는 promise
   */
  enqueue(documentUri: string, task: () => Promise<void>): Promise<void> {
    const previous = this.editQueues.get(documentUri) ?? Promise.resolve();
    const next = previous.then(task, task).finally(() => {
      if (this.editQueues.get(documentUri) === next) this.editQueues.delete(documentUri);
    });
    this.editQueues.set(documentUri, next);
    return next;
  }

  /**
   * size 함수.
   * 현재 pending document queue 수를 반환함.
   *
   * @returns pending queue map size
   */
  size(): number {
    return this.editQueues.size;
  }
}
