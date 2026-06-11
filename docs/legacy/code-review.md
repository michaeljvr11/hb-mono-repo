# Code Review Standards

## Baseline Standards

- Preserve TypeScript typing and avoid `any` unless justified.
- Keep frontend and backend contracts aligned.
- Validate backend inputs with DTOs and decorators instead of ad hoc controller checks.
- Preserve existing auth, ownership, and role enforcement patterns.
- Prefer small diffs with no unrelated refactors.
- Confirm the change fits the existing project architecture before introducing new abstractions.

## Backend Review Focus

- Controllers should stay thin when the service layer already carries business logic.
- Sensitive fields such as passwords, refresh tokens, and internal-only vendor/user data must not leak in API responses.
- Public routes must be explicit because JWT auth is global.
- Error handling should be consistent and useful without exposing internals.
- Changes affecting entities, DTOs, or response shapes should trigger doc updates.

## Frontend Review Focus

- API calls belong in services, not directly in components.
- Models and interfaces should match backend DTOs and response envelopes.
- Environment configuration should own API base URLs.
- Early-stage frontend work should avoid overengineering.

## E-Commerce Specific Checks

- Do not expose sensitive user, vendor, auth, or internal operational data.
- Confirm ownership rules for vendor-managed resources.
- Be cautious with product price, stock, and category changes because they affect storefront behavior.
- Do not invent checkout, payment, or shipping rules without implemented source evidence.

## Verification Expectations

- Run available build, lint, or test commands when practical.
- If checks cannot be run, say so clearly.
- Update docs when APIs, models, DTOs, business rules, or architecture change.
