# Stream Helper Agent Guide

## Build/Test Commands
```bash
npm run build     # Compile TypeScript to dist/
npm run dev       # Run with tsx (development) 
npm run watch     # Auto-compile on changes
npm start         # Run compiled version
```

## Code Style & Conventions
- **TypeScript**: ES2022 target, ES modules (`type: "module"`), strict mode, source maps enabled
- **Imports**: Use `.js` extensions for local imports (e.g., `import { Config } from './config.js'`)
- **Types**: Define interfaces in `src/types.ts`, use `type` imports when importing only types
- **No External Dependencies**: Runtime code uses ONLY Node.js built-ins to minimize footprint (critical constraint)
- **Async/Await**: Prefer async/await over callbacks, handle errors with try/catch
- **Error Handling**: Throw descriptive errors, implement exponential backoff for retries (see `src/monitor.ts`)
- **File Organization**: One class/module per file, export as named exports (not default)
- **Process Management**: Handle SIGINT/SIGTERM for graceful shutdown, clean up child processes
- **Logging**: Use console.log with prefixes like `[Config]`, `[Stream]`, respect LOG_LEVEL from .env
- **FFmpeg Integration**: Build commands in `src/streamer.ts`, use drawtext filter for overlays with reload=1