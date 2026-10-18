# Application icon

The approved mark is a Cyrillic **П** shaped like headphones. `icon-master.png`
is the selected original artwork. `icon.svg` is its clean vector tracing and
defines the shared Android foreground / monochrome silhouette and colors.

Run `python scripts/generate_icons.py` to generate PNG / Windows ICO (16–256 px),
legacy Android densities, and adaptive Android XML resources. Both build jobs
run this generator, so a release cannot silently restore the previous icon.

Android uses separate background and transparent vector foreground layers.
The mark is scaled into the central 66 dp circular safe zone of the 108 dp
viewport; the launcher supplies its own circle, squircle, or other mask.
Android 13+ resources include the same shape as a white-on-transparent
`monochrome` layer. The launcher can tint it with the user's system palette;
the app does not bake an accent color into that mask or change launcher settings.

On Samsung, the user-facing option is under Wallpaper and style → Color palette
→ Apply palette to app icons. Availability for third-party icons depends on the
One UI / launcher version and user settings; a Galaxy Themes icon pack may
override application resources. The standard cream-on-charcoal artwork remains
available when themed icons are off or unsupported.

Native `LauncherIconTest` checks the actual packaged adaptive resource, safe
area, transparent center, Android 13+ monochrome lookup, and several tint colors.
The Windows / web icon and all older Android raster sizes use the approved PNG.

References:
- https://developer.android.com/develop/ui/compose/system/icon_design_adaptive
- https://www.samsung.com/au/members/whats-new/colour-your-galaxy-your-way/
