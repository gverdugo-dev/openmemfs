// Starts the server (restarting on changes) and Vite together; Ctrl+C stops both.
const children = [
  Bun.spawn(['bun', '--watch', 'server/main.ts'], { stdio: ['inherit', 'inherit', 'inherit'] }),
  Bun.spawn(['bunx', 'vite'], { stdio: ['inherit', 'inherit', 'inherit'] }),
]
const stop = () => {
  for (const child of children) child.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
await Promise.race(children.map((child) => child.exited))
stop()
