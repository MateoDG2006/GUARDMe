import net from 'node:net';

const host = process.env.DB_HOST ?? 'db';
const port = Number(process.env.DB_PORT ?? 5432);
const attempts = Number(process.env.DB_WAIT_ATTEMPTS ?? 30);
const delayMs = Number(process.env.DB_WAIT_DELAY_MS ?? 2000);

function once() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(undefined);
    });
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error('timeout'));
    });
    socket.on('error', reject);
  });
}

for (let i = 1; i <= attempts; i += 1) {
  try {
    await once();
    console.log(`db ready at ${host}:${port}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`waiting for ${host}:${port} (${i}/${attempts}): ${message}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

console.error(`database not reachable at ${host}:${port}`);
process.exit(1);
