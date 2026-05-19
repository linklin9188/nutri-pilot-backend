---
name: Quiet Luxury Kitchen
colors:
  surface: '#f9f9fb'
  surface-dim: '#d9dadc'
  surface-bright: '#f9f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f5'
  surface-container: '#eeeef0'
  surface-container-high: '#e8e8ea'
  surface-container-highest: '#e2e2e4'
  on-surface: '#1a1c1d'
  on-surface-variant: '#4d4635'
  inverse-surface: '#2f3132'
  inverse-on-surface: '#f0f0f2'
  outline: '#7f7663'
  outline-variant: '#d0c5af'
  surface-tint: '#735c00'
  primary: '#735c00'
  on-primary: '#ffffff'
  primary-container: '#d4af37'
  on-primary-container: '#554300'
  inverse-primary: '#e9c349'
  secondary: '#5f5e60'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfe1'
  on-secondary-container: '#636264'
  tertiary: '#5e5e63'
  on-tertiary: '#ffffff'
  tertiary-container: '#b3b2b7'
  on-tertiary-container: '#444549'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffe088'
  primary-fixed-dim: '#e9c349'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#e4e2e4'
  secondary-fixed-dim: '#c8c6c8'
  on-secondary-fixed: '#1b1b1d'
  on-secondary-fixed-variant: '#474649'
  tertiary-fixed: '#e3e2e7'
  tertiary-fixed-dim: '#c7c6cb'
  on-tertiary-fixed: '#1a1b1f'
  on-tertiary-fixed-variant: '#46464b'
  background: '#f9f9fb'
  on-background: '#1a1c1d'
  surface-variant: '#e2e2e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-1:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '600'
    lineHeight: 41px
    letterSpacing: -0.01em
  headline-2:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 34px
    letterSpacing: 0em
  body-main:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-secondary:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-bold:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  margin-page: 32px
  gutter-card: 24px
  padding-item: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 40px
---

## Brand & Style

This design system is built on the philosophy of "Quiet Luxury"—a digital white-glove service for the high-net-worth culinary environment. It prioritizes frictionless AI assistance over decorative clutter. 

The visual style is **Ultra-Minimalist Apple HIG**, emphasizing spatial depth, generous negative space, and a refined editorial feel. It evokes an emotional response of calm, precision, and exclusivity. The interface does not compete for attention; it anticipates needs through clear hierarchy and a light, airy aesthetic that complements modern, high-end kitchen architecture.

## Colors

The color palette is rooted in Apple’s Soft Gray to provide a neutral, non-fatiguing canvas. Pure White is reserved strictly for interactive containers and primary content cards to create a "floating" effect. 

The **Champagne Gold** accent is used with surgical precision to indicate premium AI features and active states. It should never be used for large backgrounds; instead, it serves as a sophisticated highlight. The **Interactive Glow** provides soft haptic-like visual feedback, ensuring the UI feels responsive and alive without being aggressive.

## Typography

This design system utilizes **Inter** to achieve a clean, systematic look reminiscent of SF Pro. Typography is used to create an editorial rhythm. 

Headlines are set with tighter letter-spacing and heavier weights to feel grounded and authoritative. Body text uses Apple’s standard 17px base for optimal readability. Labels for nutritional data or technical kitchen metrics use a slightly tracked-out uppercase style to differentiate data points from narrative instructions.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for large screens (centered content with wide margins) and a fluid model for mobile tablets often used in kitchen docks. 

A 12-column grid is used for desktop experiences, but the "Information Density" remains low. Content is grouped into logical modules with a 40px (stack-lg) separation between major sections. The "Spatiality" of the design system relies on these wide gaps to prevent the user from feeling overwhelmed during high-activity cooking tasks.

## Elevation & Depth

Hierarchy is established through **Ambient Shadows** and **Tonal Layers** rather than heavy borders. 

1.  **Level 0 (Base):** #F5F5F7 background.
2.  **Level 1 (Cards):** #FFFFFF surfaces with a high-end, diffused shadow (`0 10px 30px rgba(0,0,0,0.03)`).
3.  **Level 2 (Overlays):** Modal elements or fly-out AI suggestions utilize a **Backdrop Blur** (Apple-style Frosted Glass) to maintain context of the kitchen workflow behind the interface.

Avoid harsh lines. If a separator is required, use a 1px stroke of #F5F5F7 to maintain the minimalist integrity.

## Shapes

The shape language is sophisticated and approachable. While the system adheres to a "Rounded" philosophy, it employs specific radii to denote hierarchy:

- **Main Content Cards:** 24px radius for a soft, premium container feel.
- **Interactive Elements:** Buttons, input fields, and tags use 16px radius.
- **Media/Thumbnails:** Food imagery and ingredient photos should use 16px to match buttons, creating a cohesive internal logic.

The high corner radius values ensure that the interface feels "human" and safe, contrasting with the hard surfaces typical of professional kitchen environments.

## Components

### Buttons
Primary buttons use a "Soft Gold Glow" background (`rgba(212, 175, 55, 0.1)`) with Champagne Gold text. They have no border. Secondary buttons are ghost-style with a subtle #86868B border or simple text links.

### Cards
All content exists in 24px rounded white cards. There are no visible borders; depth is provided purely by the 0.03 opacity ambient shadow.

### AI Kitchen Inputs
Input fields are minimalist—just a bottom border of #86868B that transforms into a Champagne Gold glow upon focus. For "AI Concierge" mode, the input may be a larger, centered text area with a subtle shimmering gold gradient cursor.

### Specialized Components
- **Nutrition Gauge:** A thin, circular gold stroke representing progress toward daily intake goals.
- **Ingredient Status Chips:** Small, 16px rounded pill-shaped indicators using secondary text for "Inventory: High" or "Inventory: Low" (with a tiny gold dot).
- **The "Pilot" Float:** A persistent, semi-transparent frosted glass button at the bottom center for quick AI voice or text activation.