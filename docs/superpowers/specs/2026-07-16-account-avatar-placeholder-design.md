# Account Avatar Placeholder Design

## Goal

Replace the current pixel-person fallback for accounts that have no uploaded avatar with a neutral camera placeholder that matches the mini program's existing pixel-art asset library.

## Scope

- Use `assets/sprites/actions/action_camera.png` when a logged-in account has no `avatarUrl`.
- Apply the same fallback on the account settings page and the logged-in account card on the Mine page.
- On the account settings page, show `添加` over the placeholder and `更换` after an avatar has been selected or saved.
- Keep uploaded account avatars unchanged.
- Keep the logged-out Mine card without an avatar frame.
- Do not change baby profile avatars or avatar upload behavior.

## Presentation

The placeholder keeps the existing rounded avatar frame and warm background. The camera sprite is centered with `aspectFit`, leaving breathing room around the icon so it reads as an upload affordance instead of a user portrait.

The Mine account card uses the same camera sprite without an overlaid action label. The whole account card remains the route to account settings.

## Data And Behavior

No account data model changes are required. The UI continues to use `profile.avatarUrl` when present and only falls back to the camera asset when it is empty.

Selecting an avatar immediately replaces the placeholder in the account settings preview. Saving continues through the existing account service.

## Tests

- Verify the account settings page references the camera placeholder and switches between `添加` and `更换` based on `avatarUrl`.
- Verify the Mine page uses the camera placeholder only for logged-in accounts without an avatar.
- Verify the logged-out Mine card still renders no avatar frame.
- Run the focused Mine and account settings page tests, followed by the full test suite.
