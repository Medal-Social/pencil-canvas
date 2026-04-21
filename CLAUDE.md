# @medalsocial/pencil-canvas — Claude Guide

## What this is
React component for rendering .pen file node trees as SVG/canvas. Public open-source.

## Branch Strategy
feat/* → dev → prod

## Release Pipeline
Uses Changesets with npm OIDC trusted publishing. No static NPM_TOKEN needed.

## Key Rules
- Public repo — never commit secrets
- License is Apache-2.0 — do not change
- No NPM_TOKEN — publishing uses OIDC
- Authoritative source is medal-monorepo/open/pencil-canvas
