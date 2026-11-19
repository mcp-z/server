import * as http from 'http';
import type { AddressInfo } from 'net';

export interface LoopbackServer {
  port: number;
  /** Routes requests to `app`; call once the app that needs `port` has been built. */
  mount: (app: http.RequestListener) => void;
  /** Drops open connections, then resolves once the server has fully closed. */
  close: () => Promise<void>;
}

/** Listens on 127.0.0.1 with an OS-assigned port and resolves once it is accepting connections. */
export async function listenLoopback(): Promise<LoopbackServer> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    port: (server.address() as AddressInfo).port,
    mount: (app) => {
      server.on('request', app);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
