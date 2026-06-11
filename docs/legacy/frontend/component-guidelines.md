# Component Guidelines

## General Rules

- Keep components focused on presentation and interaction flow.
- Put API logic in services.
- Put reusable data shapes in typed interfaces/models.
- Avoid business logic in templates.
- Keep templates simple and readable.

## Recommended Separation

- Components:
  - rendering
  - local UI state
  - user interaction handling
- Services:
  - HTTP calls
  - response mapping
  - auth/session helpers
- Models/interfaces:
  - request payloads
  - response envelopes
  - view-safe typed shapes

## Angular-Specific Guidance

- Follow the project's standalone component direction unless the app structure changes intentionally.
- Prefer typed `@Input()` and `@Output()` contracts.
- Keep guards and interceptors in shared/core areas.
- Use environment configuration for external URLs and app-level settings.

## Reusable UI Patterns To Favor

- auth forms with reactive form validation, submit loading state, inline errors, service-based API calls, and snackbar success feedback
- product cards
- category lists
- empty states
- loading states
- inline validation states

## Avoid

- direct `HttpClient` usage inside page components
- duplicated API URL strings
- template-heavy conditionals that hide business rules
- premature state-management complexity before the app needs it
