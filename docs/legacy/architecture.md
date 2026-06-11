# Architecture Overview

## Monorepo Structure

- `hb-landing`: Angular marketing site with standalone routes for Home, About, Services, and Contact. It includes shared layout, shared constants, contact-form integration, and brand/theme styling in `src/styles.scss`.
- `hb-backend`: NestJS 11 API using TypeScript, PostgreSQL via TypeORM, JWT auth, refresh tokens via cookies, global validation, and role-based access control.
- `hb-frontend`: Angular application using standalone routing and environment-based API configuration. Current implementation is early-stage and mainly contains auth scaffolding.

## Current Responsibilities

- `hb-landing` is the public company website and the best source for brand, messaging, and business context.
- `hb-backend` is the operational source of truth for implemented domains such as auth, users, vendors, products, and categories.
- `hb-frontend` is the future marketplace/client application and currently contains login/register views, auth service scaffolding, route guards, and environment configuration.

## Likely Data Flow

1. A user interacts with `hb-frontend`.
2. Angular services call `hb-backend` routes under `/api/...`.
3. `hb-backend` validates DTOs through the global `ValidationPipe`.
4. Guards enforce JWT authentication by default, with `@Public()` required for public routes.
5. Controllers delegate to services, which work with TypeORM entities and PostgreSQL.
6. Response DTOs and mapper utilities shape public API responses.

## Public Website Role

`hb-landing` is separate from the application frontend. It is the live company/marketing site and currently communicates:

- H&B's cross-border South Africa to Namibia focus
- Import-request and quote workflows
- Marketplace coming-soon messaging
- Brand colors and visual direction

## Notes

- Rooted in repo inspection as of 2026-06-02.
- `hb-frontend` is still sparse, so some future architecture details remain intentionally undefined.
