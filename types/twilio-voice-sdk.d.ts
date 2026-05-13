/**
 * Minimal type shim for @twilio/voice-sdk so local typecheck passes
 * without `npm install`. The package itself ships with its own .d.ts;
 * Netlify installs it during the build step. This shim only needs to
 * cover the surface area we actually use in /tasks.
 *
 * If you need richer types (e.g. the Call lifecycle event payloads),
 * just `npm install @twilio/voice-sdk` and remove this file -- the
 * real types take over.
 */
declare module "@twilio/voice-sdk" {
  export class Device {
    constructor(token: string, options?: Record<string, unknown>);
    register(): Promise<void>;
    updateToken(token: string): void;
    destroy(): void;
    connect(opts: { params: Record<string, string> }): Promise<unknown>;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }
}
