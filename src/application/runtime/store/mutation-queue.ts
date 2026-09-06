/** A rejected operation still completes its revision and never blocks later commands. */
export class AppStoreMutationQueue {
  private tail: Promise<void> = Promise.resolve();
  private requestedRevision = 0;
  private completedRevision = 0;

  getRequestedRevision = (): number => this.requestedRevision;
  getCompletedRevision = (): number => this.completedRevision;

  run<T>(operation: (revision: number) => Promise<T>): Promise<T> {
    const revision = ++this.requestedRevision;
    const task = this.tail.then(() => operation(revision));
    this.tail = task.then(
      () => {
        this.completedRevision = revision;
      },
      () => {
        this.completedRevision = revision;
      },
    );
    return task;
  }
}
