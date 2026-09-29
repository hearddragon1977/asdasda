# Multi-Agent Operational Guidelines

## Local development

This app is a Vite + React client. Dependencies are locked with Bun (`bun.lock`); CI installs with `bun install`.

- Install: `bun install --frozen-lockfile`
- Typecheck: `bun run lint`
- Production build: `bun run build`
- Dev server: `bun run dev` (Vite on `0.0.0.0:3000`)

The tactical simulator runs without secrets. `.env.example` lists `GEMINI_API_KEY` and `APP_URL`; the current client does not read them. Google sign-in is optional. Local play, the map, the scoreboard, and the pause menu work without an account.

Set `DISABLE_HMR=true` to turn off Vite HMR and file watching.

## Boundaries & Constraints
1. **Never commit directly to `main` or `dev`.** All work must be done on isolated feature branches.
2. **File Scope:** Do not modify files outside your assigned job domain (e.g., UI agents must not alter AI behavior core logic).
3. **No Secret Leaks:** Never hardcode API keys, tokens, or credentials into source files. Use environment variables.
4. **Code Quality:** Ensure all files compile cleanly with Vite/TypeScript before opening a Pull Request.
