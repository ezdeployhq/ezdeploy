import { spawn } from "node:child_process";

export class ProcessCommandRunner {
  run(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: NodeJS.ProcessEnv;
      inheritEnv?: boolean;
    },
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.inheritEnv === false ? options.env : { ...process.env, ...options.env },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`${command} exited with code ${code}: ${(stderr || stdout).trim()}`));
      });
    });
  }
}
