# Testing And Validation

## Available Scripts

From `package.json`:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:watch`
- `npm run test:cov`
- `npm run test:debug`
- `npm run test:e2e`

## Validation Patterns

- Global `ValidationPipe` is registered in `src/app.module.ts`.
- DTOs use `class-validator` decorators such as:
  - `@IsEmail`
  - `@IsNotEmpty`
  - `@MinLength`
  - `@IsEnum`
  - `@IsNumber`
  - `@IsPositive`
  - `@IsUUID`
  - `@IsOptional`
- Product DTOs use `class-transformer` `@Type(...)` for numeric coercion.
- File uploads are validated in controller pipes for file type and max size.

## Test Coverage Status

- Test tooling is configured with Jest, `ts-jest`, and Supertest.
- `test/app.e2e-spec.ts` is still starter-level coverage.
- The existing e2e test targets `/` while the main controller route currently lives under `/api`, so the current e2e test is not aligned with the inspected API structure.

## Local Infrastructure

- `docker-compose.yml` provides a PostgreSQL 16 database container for local development.

## Current Gaps

- No meaningful auth, vendor, product, or category behavior tests were found in the inspected source.
- Upload behavior and static file serving are not fully documented by tests.
- Validation is in place structurally, but domain-specific error-path coverage appears limited.
