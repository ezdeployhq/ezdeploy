import { spawn } from "node:child_process";

export interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  acceptTimeout?: boolean;
  inheritEnv?: boolean;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], options: CommandOptions): Promise<CommandResult>;
}

export class ProcessCommandRunner implements CommandRunner {
  run(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.inheritEnv === false ? options.env : { ...process.env, ...options.env },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : undefined;
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
      child.once("error", reject);
      child.once("close", (code) => {
        if (timer) clearTimeout(timer);
        if (code === 0 || (timedOut && options.acceptTimeout)) resolve({ stdout, stderr });
        else {
          const error = new Error(
            `${command} exited with code ${code}: ${(stderr || stdout).trim()}`,
          );
          Object.assign(error, { code, stdout, stderr });
          reject(error);
        }
      });
      if (options.stdin) child.stdin.write(options.stdin);
      child.stdin.end();
    });
  }
}
