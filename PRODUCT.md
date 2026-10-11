# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML, CSS, and JavaScript served as static files; Docker provides a local and deployable web server. The choice follows the requested local, Dockerized, iPhone-friendly website.

## Users

People who want a quick block puzzle on an iPhone or computer without installing an App Store app.

## Product Purpose

Provide a free, ad-free block puzzle that is pleasant to play on touch screens and with a mouse or keyboard.

## Operating Context

Play in a browser or from an iPhone Home Screen. Sessions are short and may be interrupted. Game progress should survive a page reload on the same device.

## Capabilities and Constraints

- Eight-by-eight board, three pieces at a time, row and column clears, score, best score, and game over.
- Touch dragging and a tap-to-place alternative; mouse and keyboard support.
- No accounts, analytics, advertising, payments, or external runtime services.
- Local-only development and delivery. No publication to Codex Apps.
- Ready to deploy to any static web host later.

## Product Principles

- Put the board and pieces first, especially on iPhone.
- Make each placement legible and satisfying.
- Keep the game playable offline after its first visit.
- Keep source and deployment simple enough for a public repository.
