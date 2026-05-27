# TestCase: SAMPLE-001

## Title

Short human-readable title

## Tags

- area:core
- type:e2e
- priority:p2

## Runner

- preferred: playwright
- suite: smoke

## Preconditions

- base_url: http://localhost:3000
- seed: user_standard
- feature_flags: []
- auth: none

## Data

- user.email: user@example.com
- user.password: correct-horse-battery-staple

## Steps

1. goto: /login
2. fill: { field: "Email", value: "{{user.email}}" }
3. fill: { field: "Password", value: "{{user.password}}" }
4. click: { target: "Log in" }

## Assertions

- url_contains: /dashboard
- visible: { target: "h1", text: "Dashboard" }
- not_visible: { target: "text", text: "Invalid credentials" }

## Locators (Optional)

- strategy_order: [testid, role, label, text]
- map:
  login_button: { testid: "login-submit" }

## Healing Policy

- allow:
  - selector_update
  - timing_waits
  - flow_popups
- deny:
  - assertion_update
- require_approval_for: [assertions, steps, preconditions]
