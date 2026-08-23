# Design QA

## Evidence

- Source visual truth (timer): `.codex-remote-attachments/019ff187-2bce-7f70-9a41-84c0e4483ced/23f6e339-b79e-436e-bacf-75e960f8a27a/1-Photo-1.jpg`
- Implementation (timer): `.artifacts/timer-keypad-final-344x640.png`
- Full-view comparison (timer): `.artifacts/timer-keypad-final-comparison.png`
- Source visual truth (wake settings): `.codex-remote-attachments/019ff187-2bce-7f70-9a41-84c0e4483ced/91829407-be94-4516-966e-836112188bbd/1-Photo-1.jpg`
- Implementation (wake settings): `.artifacts/shared-wake-settings-390x844.png`
- Full-view comparison (wake settings): `.artifacts/shared-wake-settings-comparison.png`
- Timer source: 688 × 1280 px (@2x), normalized to the 344 × 640 CSS viewport.
- Timer implementation: 344 × 640 px at density 1.
- Wake source: 627 × 1280 px, normalized with contain fitting to 390 × 844.
- Wake implementation: 390 × 844 px at density 1.
- Theme/state: dark theme; empty direct-input timer; selected common wake lead of 2 hours.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Typography: the app design-system font and weights preserve the source hierarchy; the intentional `시` removal leaves only `분·초` without wrapping or truncation at 320/344dp.
- Spacing/layout: the four keypad rows and sticky cancel/start actions remain visible at 320 × 640 and 344 × 640. Touch targets are at least 48dp.
- Colors/tokens: background, muted key surfaces, disabled action state, focus ring, and active action use existing design-system tokens with sufficient state separation.
- Image/assets: the reference has no imagery to reproduce. Existing app icons are used for close and play; the delete action uses a localized text label for clarity.
- Copy/content: the direct-input helper explains the existing whole-minute contract. The wake screen states once that the selected lead applies to the active work shifts and shows the resulting times in full.
- Accessibility/interaction: the modal exposes one heading, a radiogroup/button structure, disabled states, error-specific start labels, Android close handling, and post-dismiss focus restoration. Browser console errors on the final fresh pass: 0.
- Focused-region comparison was not needed because the labels, key shapes, selected state, and action controls were legible in the 1:1 full-view evidence.

## Comparison History

1. Initial comparison found a web focus crash and actions below the compact viewport. The web focus call was guarded and cancel/start actions were moved into a persistent footer.
2. Interaction review found that typing `60` could normalize silently to 1 minute. Raw `00분 60초` is now invalid, while `6000` produces a valid `60분 00초` timer.
3. The post-fix 344 × 640 comparison confirms the complete keypad and both actions are visible. A separate 320 × 640 pass also showed no clipping.
4. The wake-settings comparison confirms the day/night tabs are removed and one `2시간 전` selection updates the shared active-shift setting while retaining full calculated times.

## Primary Interactions Tested

- `15` then `00` → `15분 00초`, start enabled.
- `60` → invalid `00분 60초`, start disabled with a matching accessibility error.
- `6000` → `60분 00초`, start enabled.
- Empty input → delete and start disabled.
- `2시간 전` → common selected state and both day/night calculated wake times updated.
- Fresh browser pass on the wake screen → no console errors.

## Follow-up Polish

- P3: replace the localized delete text with the established icon library if a matching backspace icon is added to the app design system later.

final result: passed
