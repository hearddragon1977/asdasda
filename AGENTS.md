# Multi-Agent Operational Guidelines

## Boundaries & Constraints
1. **Never commit directly to `main` or `dev`.** All work must be done on isolated feature branches.
2. **File Scope:** Do not modify files outside your assigned job domain (e.g., UI agents must not alter AI behavior core logic).
3. **No Secret Leaks:** Never hardcode API keys, tokens, or credentials into source files. Use environment variables.
4. **Code Quality:** Ensure all files compile cleanly with Vite/TypeScript before opening a Pull Request.
