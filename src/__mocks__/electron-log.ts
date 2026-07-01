// Mock for electron-log — used in vitest to avoid requiring the Electron binary
const noop = () => {}
const log = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  verbose: noop,
  silly: noop,
  log: noop,
}
export default log
