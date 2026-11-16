# Benchify brand assets

The two supplied SVGs were moved byte-for-byte from the repository root to [frontend/public/brand](../frontend/public/brand). Their original filenames are unchanged.

| Original filename | Artwork | Geometry and transparency | Placement |
|---|---|---|---|
| benchify-icon.svg | White lowercase b on a charcoal rounded square | SVG, 64 × 64, 1:1. Transparent outside the rounded square. | Browser favicon, branded 404, source for raster app icons, part of the social card. The contrasting white mark and dark tile work against both UI themes. |
| benchify-wordmark.svg | Charcoal hand-drawn Benchify lettering | SVG, 224 × 64, 3.5:1. Transparent background. | Main navigation and README on a light surface, and public social card. The light backing preserves contrast in dark mode without changing the lettering. |

The README uses an opaque light-backed wordmark PNG for both GitHub themes. The central asset directory contains 180 × 180 Apple touch, 192 × 192 and 512 × 512 manifest PNGs rendered from the icon. The 1200 × 630 social PNG composes both original renderings on a light background. The PNG app icons retain transparent corners. Next metadata and the manifest reference these files. The install metadata supplies icons and display settings. The app currently has no service worker.

The frontend has one horizontal navigation. Agent configuration lives in operator settings and datasets live in the versioned fixture catalog. The design pass uses the existing form and report layouts with shared focus, border, status and control colors, better mobile navigation wrapping, and a branded 404. Technical output and machine-readable benchmark data remain free of branding.

The repository README is the documentation landing page. Linking to source assets keeps technical guides light. GitHub repository settings and its separate social preview require access to the remote repository settings. Set the GitHub image to the same generated social PNG when that access is available.

The suggested GitHub description is “Benchmark AI agents, replay the evidence, and investigate regressions.” Use the existing social PNG for the separate repository social preview. Private deployments require operator access before a visitor can read page metadata.
