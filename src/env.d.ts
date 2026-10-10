/// <reference types="vite/client" />
interface Window {
  turnstile?: {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    remove: (id: string) => void;
  };
}
