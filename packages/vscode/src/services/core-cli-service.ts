declare const require: {
  (id: string): any;
  resolve(id: string): string;
};
declare const process: {
  execPath: string;
};

const { execFile } = require('child_process') as {
  execFile: (
    file: string,
    args: readonly string[],
    options: { cwd?: string; maxBuffer: number },
    callback: (error: Error | null) => void,
  ) => void;
};
const { promisify } = require('util') as {
  promisify: <T extends (...args: any[]) => any>(fn: T) => (...args: any[]) => Promise<void>;
};

const execFileAsync = promisify(execFile);

export interface CoreCliRunOptions {
  cwd?: string;
}

export class CoreCliService {
  async run(
    command: string,
    args: readonly string[],
    options: CoreCliRunOptions = {},
  ): Promise<void> {
    const binPath = require.resolve('risu-workbench-core/bin/risu-core.js');
    const nodeArgs = [binPath, command, ...args];
    await execFileAsync(process.execPath, nodeArgs, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}
