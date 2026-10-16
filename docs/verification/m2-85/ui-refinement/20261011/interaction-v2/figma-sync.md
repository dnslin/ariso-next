# Interaction V2 Figma Sync

- Date: 2026-10-11.
- Approved reference: `http://127.0.0.1:61511/library?scenario=sample`, interaction-review-v2. The 61510 shortcut-upload draft is superseded.
- Existing file: `74sT9Hrf8G4czcWeTkET5b`. No new Figma file was created.
- [Current approved section](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b/Ariso?node-id=1116-34665): `1116:34665`, named `2026-10-11 / 已批准操作减负 v2 / 当前实施依据`.
- 80 editable screen frames: 20 states, each desktop/mobile and light/dark. Desktop is 1440 x 900; mobile is 390 x 844.
- Ten existing primary frames were updated in place. Their outer IDs remain unchanged.
- Historical shortcut section `1095:19618` is now explicitly named `2026-10-11 / 历史快捷上传稿 / 已被操作减负 v2 替代`. Other historical flows were not redrawn.

## Synced Behavior

- Public is emerald and private is violet, each with text and Globe/Lock icons. Color is not the only distinction.
- Gallery has no upload button. Selection management has one entry, a selected-item list, and a compact icon group. Business menus do not repeat the four selection-management commands.
- Public/private/no-album menus omit the corresponding redundant or unavailable actions.
- Album return is aligned with the title at the right. Edit, cover, share, and more use an icon ButtonGroup in the operation toolbar. Add images is also in that toolbar.
- Album add offers upload and library selection. Upload uses the complete upload page with the current album context, not an upload modal.
- Photo card text has 12 px horizontal padding and 16 px bottom padding. Fixed page footer and main content have separate spacing.
- Tag selection uses a 420 px right drawer on desktop and full width below 640 px. Duplicate names show a field error. Failed apply retains selection. UUIDs are absent.
- Uncreated share opens the editor directly. Only the explicit create-and-enable action creates the share. Failed create retains the form. Existing created-share configuration contracts remain unchanged.
- Album cards have a context menu. Trash uses the same selection and compact action patterns as gallery and albums.
- Successful trash uses a neutral Toast. Restore success reuses this Toast pattern with outcome-specific wording. Permanent deletion retains a single pre-action confirmation and an in-progress state. Partial failures retain failed records and retry actions.
- Primary controls have a 44 px minimum hit area. Dark examples use the existing dark palette and a Moon theme icon.

## Screen Nodes

The four columns are desktop light, desktop dark, mobile light, and mobile dark. These are static editable state references, not a claim that Figma Player interactions were verified.

| State                          | Desktop Light | Desktop Dark | Mobile Light | Mobile Dark |
| ------------------------------ | ------------- | ------------ | ------------ | ----------- |
| Gallery                        | 1117:35539    | 1117:36057   | 1117:36467   | 1117:36753  |
| Album detail                   | 1117:37147    | 1117:37709   | 1117:38163   | 1117:38497  |
| Album-context upload           | 1118:35415    | 1118:35874   | 1118:36225   | 1118:36468  |
| Share first-create editor      | 1118:36819    | 1118:37256   | 1118:37585   | 1118:37806  |
| Album card context menu        | 1118:54340    | 1118:54821   | 1118:55194   | 1118:55459  |
| Trash context menu             | 1118:55832    | 1118:56361   | 1118:56782   | 1118:57095  |
| Selection manager              | 1118:57516    | 1118:58160   | 1118:58696   | 1118:59108  |
| Album add menu                 | 1118:59628    | 1118:60204   | 1118:60672   | 1118:61020  |
| Tag duplicate-name error       | 1118:61476    | 1118:62128   | 1118:62672   | 1118:63091  |
| Tag apply error                | 1118:63618    | 1118:64271   | 1118:64816   | 1118:65236  |
| Public-image menu              | 1118:65764    | 1118:66371   | 1118:66870   | 1118:67245  |
| Private-image menu             | 1118:67728    | 1118:68335   | 1118:68834   | 1118:69209  |
| No-album image menu            | 1118:69692    | 1118:70294   | 1118:70788   | 1118:71158  |
| Trash success Toast            | 1118:71636    | 1118:72167   | 1118:72590   | 1118:72889  |
| Permanent-delete confirmation  | 1118:73296    | 1118:73840   | 1118:74276   | 1118:74604  |
| Permanent deletion in progress | 1118:75040    | 1118:75508   | 1118:75868   | 1118:76120  |
| Upload failure                 | 1118:76480    | 1118:76940   | 1118:77292   | 1118:77536  |
| Share create failure           | 1118:77888    | 1118:78326   | 1118:78656   | 1118:78878  |
| Pre-trash confirmation         | 1118:79208    | 1118:79815   | 1118:80314   | 1118:80689  |
| Partial batch failure          | 1118:81172    | 1118:81775   | 1118:82270   | 1118:82641  |

## Updated Primary Frames

Read back after replacement and final polish. Desktop outer frames remain 1440 x 1080; mobile frames remain 390 x 844. Album-list and trash primary frames exclude the supplemental open-menu overlays.

| Page         | Existing Desktop ID | New Desktop Main ID | Existing Mobile ID | New Mobile Main ID |
| ------------ | ------------------- | ------------------- | ------------------ | ------------------ |
| Gallery      | 30:285              | 1120:56557          | 98:748             | 1121:64582         |
| Album detail | 38:378              | 1120:56751          | 102:4002           | 1121:64655         |
| Upload       | 30:97               | 1120:56943          | 101:1014           | 1121:64729         |
| Album list   | 30:473              | 1120:57104          | 101:1155           | 1121:64781         |
| Trash        | 30:1037             | 1120:57266          | 102:852            | 1121:64834         |

Created-share main frame `431:3753` remains unchanged. New first-create and create-error states are in the approved supplemental section. This avoids overwriting independent existing configuration states with the simplified prototype example.

## Design-System Reuse

- Reused the existing Ariso public shell, local typography styles, semantic color variables, content photo fills, and Light/Dark variable modes.
- Asset root: `1116:34666`, `InteractionV2 / 可编辑组合`.
- Visibility semantic variables: `VariableID:1116:34667` through `VariableID:1116:34670`.
- Danger foreground: `VariableID:1120:40235`, white in both modes, mapped to the existing HeroUI semantic role.
- Existing collection: `VariableCollectionId:2:2`; Light mode `2:0`, Dark mode `264:0`.
- Missing icons were converted from the installed Lucide SVG source to editable vector components. Moon component: `1121:48324`. No manually drawn substitute icons or whole-page raster layers were introduced.
- Linked-library discovery found no linked Ariso library. Local controls and variables were reused rather than importing an unrelated design system.

## Verification

Executed Figma structural readback on the whole section before the final share-field alignment below:

- 80 screen frames; 5,096 descendant frames, 2,244 text layers, 5,408 vector layers, 2,208 instances, 296 rectangles, 8 ellipses.
- 232 photographic fills, maximum image area 64,800 px2. Whole-page raster count: 0.
- Visible UUID text count: 0.
- Visible text overflowing its direct parent: 0. Absolute overlays outside screen bounds: 0.
- Eight tag-drawer states: desktop 420 x 900, mobile 390 x 844; two checked options match the selected-count footer.
- Button minimum: 44 px.
- Existing gallery primary frames contain no title-row upload action. All ten original primary frame IDs, sizes, and replacement main layers were read back.

Ten representative exports were downloaded and visually inspected. The final tag, upload, and Toast exports were refreshed after spacing, checkbox, and dark-palette corrections. `sips -g pixelWidth -g pixelHeight` confirmed the exported dimensions. These checks cover visual states, not production API behavior or every Figma Player transition.

| Evidence                       | Node       | Export                                                                                                                                                                                                    |
| ------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gallery desktop light          | 1117:35539 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/library-desktop-light.png)         |
| Updated original album desktop | 38:378     | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/original-album-desktop-light.png)  |
| Album mobile dark              | 1117:38497 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/album-mobile-dark.png)             |
| Upload desktop light           | 1118:35415 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/upload-desktop-light.png)          |
| Share mobile light             | 1118:37585 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/share-mobile-light.png)            |
| Selection desktop light        | 1118:57516 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/selection-desktop-light.png)       |
| Tag desktop dark               | 1118:62128 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/tag-desktop-dark.png)              |
| Tag mobile light               | 1118:62672 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/tag-mobile-light.png)              |
| Permanent delete mobile light  | 1118:74276 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/permanent-delete-mobile-light.png) |
| Trash Toast desktop dark       | 1118:72167 | [PNG](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/trash-toast-desktop-dark.png)      |

## Evidence Boundary

- `figma-nodes.json` records incremental write batches and their returned created, mutated, and removed IDs, plus the final audit and primary-frame mapping.
- `figma-sync.plugin.txt` archives the initial editable construction script. Later incremental polish is recorded in the node ledger; the script alone is not an idempotent replay of the final canvas.
- Existing historical screens and created-share configuration states were not comprehensively redrawn. Restore success uses the same Toast pattern; no dedicated four-viewport restore-success set was added.
- No Figma Player flow test was performed. The approved local prototype and formal product browser checks are separate evidence owned by the implementation task.
- No product source, general handoff documentation, remote Git state, release, or deployment was changed by this sync.

## Final Share Expiry Alignment

The eight existing first-create and create-failure screens now reuse the mature `ExpiryControls` composition from `791:13600`, consistent with `src/app/shares/controls.tsx`. This patch only replaced the previous expiry input area. It did not modify the hidden-name switch, fixed-footer creation action, return action, other pages, or the existing created-share configuration screen.

- Outer label: `截止方式`.
- Two side-by-side choices: `不过期` and `指定时间`; the default example selects `不过期`.
- Choice buttons reuse existing component `759:8025`, with 48 px height inside a 56 px group.
- Existing `Expiry.Date`, `DateInputGroup`, and `CalendarClock` layers remain editable and hidden in the default example. The timezone note is retained.
- Specified-time behavior keeps the existing calendar, site timezone, minute precision, 24-hour clock, daylight-saving ambiguity handling, and field-error rules. No interface, parsing, or timezone rule was changed.
- Readback of all eight screens found no visible text overflow and no image-filled layers. Visible control text uses the existing Noto Sans SC typography. All unrelated text remained unchanged.

| Existing Screen | Replacement ExpiryControls |
| --------------- | -------------------------- |
| 1118:36819      | 1127:40479                 |
| 1118:37256      | 1127:40508                 |
| 1118:37585      | 1127:40537                 |
| 1118:37806      | 1127:40566                 |
| 1118:77888      | 1127:40595                 |
| 1118:78326      | 1127:40624                 |
| 1118:78656      | 1127:40653                 |
| 1118:78878      | 1127:40682                 |

The refreshed [share mobile screenshot](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/m2-85/ui-refinement/20261011/interaction-v2/figma/share-mobile-light.png) was exported at 390 x 844, downloaded to `.data/main-ui-review-20261011/interaction-v2/figma/share-mobile-light.png`, copied to this versioned `figma/` evidence directory, and visually inspected. The selected mode, label, timezone note, and surrounding spacing are visible. `figma-nodes.json` contains this patch's full returned node IDs and scoped readback under `shareExpiryAlignment`.

### Selected Switch Token

The eight share first-create/create-failure hidden-name switches now use the approved yellow selected background, matching the prototype ToggleRow and formal SettingSwitch `--accent` role. This Figma file has a legacy naming difference: its existing yellow variable is `primary` (`VariableID:2:6`, Light/Dark), while its legacy `accent` (`VariableID:2:8`) is teal. Only these eight fills were rebound to the existing yellow variable. No global variable value, name, or code syntax was changed.

Affected switch nodes: `1118:36993`, `1118:37430`, `1118:37651`, `1118:37872`, `1118:78062`, `1118:78500`, `1118:78722`, `1118:78944`. The same variable binding is used for both themes. All eight layout and thumb snapshots remained unchanged. Return text, footer, layout, and other controls were not modified.

The 390 x 844 share mobile export was refreshed in both evidence locations and visually checked after this fill-only correction. The write and verification records are under `shareSwitchSelectedTokenAlignment` in `figma-nodes.json`.
