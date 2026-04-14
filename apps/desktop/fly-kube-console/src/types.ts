export interface CommandResult {
  stdout: string;
  stderr: string;
  error: string | null;
}

export interface ProjectInfo {
  projectRoot: string;
  platform: string;
}

export interface ElectronAPI {
  execCommand: (command: string) => Promise<CommandResult>;
  getProjectInfo: () => Promise<ProjectInfo>;
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
  off: (channel: string, ...args: unknown[]) => void;
  send: (channel: string, ...args: unknown[]) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

declare global {
  interface Window {
    ipcRenderer: ElectronAPI;
  }
}
