Design Specification:

1. Creative Direction & Visual Style

Aesthetic: Modern, minimal, and editorial ("The Modern Auteur").

Core Palette: Warm cream backgrounds, high-contrast dark text, and soft pink accents.

Atmosphere: Clean, professional, yet creatively expressive with hand-drawn style elements.

2. Layout & Grid

Page Container:

Width: 100% (Viewport).

Height: Min-height 100vh.

Alignment: Centered content with ample white space.

Background Layering:

Base: #FDF7EF (Warm Cream).

Top Effect: hero-bg-effect layer starting at top: 0 with a height of 800px. Uses a subtle texture/gradient overlay.

Bottom Effect: decor-bottom layer at bottom: 0 with a height of 700px, opacity 0.6.

3. Component Breakdown

A. Floating Navigation Pill

Container Style:

Type: Floating Pill.

Position: fixed or sticky, top: 24px, left: 50%, transform: translateX(-50%).

Width: approx. 90% of viewport, max-width: 1200px.

Height: 72px.

Background: rgba(255, 255, 255, 0.7) with backdrop-filter: blur(20px).

Border: 1px solid rgba(0, 0, 0, 0.05).

Border Radius: 9999px (Full Pill).

Shadow: None (Flat design).

Internal Layout (3-Column Grid):

Left Column (Logo): "BOORDS".

Font: Inter, Bold (700), 24px.

Color: #191918.

Padding: 0 32px.

Center Column (Nav Links): "Pricing", "FAQ".

Gap: 40px.

Font: Inter, Medium (500), 16px.

Color: #585858.

Hover State: #191918 transition.

Right Column (CTA): "Login" Button.

Style: Matches Hero CTA shape.

Background: #111111 (Black).

Text: Inter, Bold (700), 15px, #FFFFFF.

Padding: 12px 28px.

Border Radius: 4px (Matches Hero CTA).

B. Hero Section

Spacing: 160px top margin (to clear floating nav).

Main Heading: "The Shortcut to Effective Storyboards".

Font: Inter, Extra Bold (800), 65px.

Line Height: 1.1.

Color: #191918.

Highlight Word: "Effective".

Color: #DF849D (Dusty Pink).

Decoration: Hand-drawn brushstroke underline effect behind the text.

Subheading:

Text: "Boords is the modern storyboarding tool that helps video professionals create client-ready storyboards 10x faster."

Font: Inter, Regular (400), 24px.

Line Height: 1.5.

Color: #3D3A36.

Max Width: 700px.

Alignment: Centered.

Margin: 32px auto.

C. Primary Call to Action

Button: "Get Started for Free".

Background: Linear Gradient (approx. #FF9A8B to #DF849D).

Border Radius: 4px.

Padding: 20px 48px.

Font: Inter, Bold (700), 20px.

Color: #462D28 (Dark Brown/Deep Earth).

Shadow: Subtle drop shadow for depth.

D. Social Proof Section

Stat Text: "4,961 video professionals".

"4,961" in #E099A3.

"video professionals" in #62584F.

Font: Inter, Bold (700), 14px.

Secondary Stat: "joined Boords in the last 7 days".

Color: #B2A28C.

Font: Inter, Regular (400), 14px.

Margin-top: 8px.

4. Typography & Color Specifications

Primary Font: Inter (Google Fonts).

Heading Colors: #191918.

Body Colors: #3D3A36.

Accent Pink: #DF849D.

Background Cream: #FDF7EF.

5. Spacing System

Vertical Rhythm:

Nav to Hero: 160px.

Heading to Subheading: 32px.

Subheading to CTA: 48px.

CTA to Social Proof: 24px.

Horizontal Margins: Auto-centered containers with max-width: 1440px.
