# Copilot Instructions for AI Agents

This codebase is a multi-package monorepo for a SaaS platform built with Next.js 15 (App Router), Supabase (DB/auth/storage), React 19, TypeScript, Tailwind CSS 4, and Turborepo. It supports both personal and team accounts with strict security and modern developer workflows.

## Architecture & Structure
- **Monorepo**: Apps in `apps/`, shared packages in `packages/`, build tooling in `tooling/`.
- **Main app**: `apps/web` (Next.js SaaS)
- **Dev tools**: `apps/dev-tool` (port 3010)
- **E2E tests**: `apps/e2e` (Playwright)
- **Supabase schemas**: `apps/web/supabase/schemas/`
- **Shared UI/components**: `packages/ui/`

## Developer Workflows
- **Start all apps**: `pnpm dev`
- **Main app only**: `pnpm --filter web dev` (port 3000)
- **Supabase local**: `pnpm supabase:web:start`
- **Reset DB/schema**: `pnpm supabase:web:reset`
- **Generate DB types**: `pnpm supabase:web:typegen`
- **Create migration**: `pnpm --filter web supabase:db:diff`
- **Lint/format/typecheck**: `pnpm lint && pnpm format && pnpm typecheck`
- **Run tests**: `pnpm test`

## Key Patterns & Conventions
- **App routes**: Organized by context (marketing, auth, user, team, admin) in `apps/web/app/`
- **Component structure**: Use `_components/` for route-specific, `_lib/` for utilities, root for global
- **Database**: Always enable RLS, use helper functions (see `AGENTS.md`), never use SECURITY DEFINER without explicit checks
- **TypeScript**: Infer types from generated DB types, avoid `any`/`unknown`
- **Data fetching**: Prefer Server Components for initial load, use parallel fetching for performance
- **Server actions**: Use `enhanceAction` from `@kit/next/actions`
- **API routes**: Use `enhanceRouteHandler` from `@kit/next/routes`
- **Forms**: Use React Hook Form + Zod schemas
- **i18n**: Use `Trans` from `@kit/ui/trans`, add new languages in `apps/web/public/locales/`
- **Testing**: Add `data-test` attributes to interactive elements
- **Logging**: Use `getLogger` from `@kit/shared/logger`

## Security & Permissions
- **RLS**: Enforced on all tables, use helper functions for access control
- **Never expose sensitive data** to client components
- **Admin client**: Only use with explicit manual authorization
- **OTP**: Use for sensitive operations via `@kit/otp`

## Integration Points
- **Supabase config**: `apps/web/supabase/config.toml`
- **Feature flags**: `apps/web/config/feature-flags.config.ts`
- **i18n settings**: `apps/web/lib/i18n/i18n.settings.ts`
- **Middleware**: `apps/web/middleware.ts`

## Examples
- **Team workspace**: `apps/web/app/home/[account]/`
- **Personal dashboard**: `apps/web/app/home/(user)/`
- **Admin section**: `apps/web/app/admin/`
- **Billing**: `apps/web/app/home/[account]/billing/_lib/server/team-billing.service.ts`

For more, see `AGENTS.md` and package-level READMEs. Always follow project-specific security and type safety patterns.
