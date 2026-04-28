# @medalsocial/pencil-canvas

[![npm](https://img.shields.io/npm/v/@medalsocial/pencil-canvas.svg)](https://www.npmjs.com/package/@medalsocial/pencil-canvas)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

React component for rendering [`.pen`](https://medal.social) file node trees as SVG. Drop a parsed Pencil document into your app and get pixel-faithful vector output with optional toolbar controls (export, zoom, theme variables).

## Install

```bash
pnpm add @medalsocial/pencil-canvas
```

```bash
npm install @medalsocial/pencil-canvas
```

```bash
yarn add @medalsocial/pencil-canvas
```

Peer dependencies: `react` >= 18.

## Quick start

```tsx
import { PenViewer } from '@medalsocial/pencil-canvas';

export function MyDocument({ penNodes }: { penNodes: unknown[] }) {
  return <PenViewer data={penNodes} width={800} height={600} />;
}
```

`data` is the raw node array as exported from a `.pen` file (or returned by the Pencil MCP `batch_get` API). `PenViewer` parses, resolves layout, and renders the tree as SVG.

## API

### `<PenViewer>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `unknown[]` | required | Raw `.pen` node array |
| `width` | `number` | `1440` | Render width in px |
| `height` | `number` | `900` | Render height in px |
| `className` | `string` | — | Class on the root SVG container |
| `style` | `React.CSSProperties` | — | Inline style on the root |
| `showToolbar` | `boolean` | `true` | Render the export/zoom toolbar |
| `variables` | `Record<string, string>` | — | Override design-token variable values at render time |

### Lower-level helpers

If you want to parse + lay out without rendering, the underlying utilities are exported too:

```ts
import { parseNodeTree, resolveLayout } from '@medalsocial/pencil-canvas';
import type { PenNode, ResolvedNode } from '@medalsocial/pencil-canvas';

const rawData: unknown[] = /* nodes from a .pen file */ [];
const width = 1440;
const height = 900;

const parsed: PenNode[] = parseNodeTree(rawData);
const resolved: ResolvedNode[] = parsed.map((node) =>
  resolveLayout(node, 0, 0, width, height)
);
```

`resolveLayout` operates on a single `PenNode` and takes positional offsets plus the available width/height of its parent (`resolveLayout(node, parentX, parentY, availableWidth, availableHeight)`), matching what `PenViewer` uses internally.

## Supported node types

`frame`, `group`, `rectangle`, `ellipse`, `line`, `polygon`, `path`, `text`, `icon_font`, `image`, `ref`.

Effects supported: linear/radial gradients, drop shadows, inner shadows, blurs, strokes (with dash patterns).

## Development

```bash
pnpm install
pnpm test           # Vitest unit tests
pnpm build          # tsup → dist/
pnpm lint           # Biome
```

Authoritative source lives in [`medal-monorepo/open/pencil-canvas`](https://github.com/Medal-Social/pencil-canvas).

## Releases

Releases are driven by [Changesets](https://github.com/changesets/changesets) and the **Medal Social Release Bot**. To ship a change:

1. Add a changeset on your feature branch: `pnpm changeset`
2. Open a PR to `prod`
3. After merge, the Release Bot opens a release PR; **Medal Approvals** auto-approves it
4. Merge the release PR → npm publish via OIDC trusted publishing

## License

[Apache-2.0](LICENSE) © Medal Social
