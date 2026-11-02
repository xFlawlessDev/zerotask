/**
 * Starts the API and the web app together for local development.
 *
 * Each child inherits the terminal, so logs stay readable. Stopping either child
 * (or pressing Ctrl+C here) stops both, so no server is left holding its port.
 */
const children = [
  Bun.spawn(["bun", "run", "dev:api"], { stdout: "inherit", stderr: "inherit", stdin: "ignore" }),
  Bun.spawn(["bun", "run", "dev:web"], { stdout: "inherit", stderr: "inherit", stdin: "ignore" }),
];

function stopAll(code: number): never {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

const exits = children.map((child) => child.exited);
const first = await Promise.race(exits.map((exited, index) => exited.then((code) => ({ code, index }))));
console.error(`A dev server exited with code ${first.code}. Stopping the other one.`);
stopAll(first.code || 1);
