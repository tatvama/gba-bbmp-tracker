export interface StartupTask {
  name: string;
  critical: boolean; // If true, failures will halt server startup and call process.exit(1)
  run(): Promise<void>;
}
