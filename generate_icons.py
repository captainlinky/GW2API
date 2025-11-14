#!/usr/bin/env python3
"""
Generate PNG icons from SVG for PWA support.
Falls back to simple colored squares if dependencies not available.
"""

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    print("PIL/Pillow not available, will create simple fallback icons")
    HAS_PIL = False

def create_fallback_icon(size, output_path):
    """Create a simple fallback icon without PIL."""
    # Create a simple BMP-like structure (not ideal but works)
    # For now, just inform the user
    print(f"Creating fallback for {output_path}")
    # We'll just touch the file - the SVG fallback will be used
    with open(output_path, 'wb') as f:
        f.write(b'')

def create_icon_with_pil(size, output_path):
    """Create icon using PIL/Pillow."""
    # Create image with dark background
    img = Image.new('RGB', (size, size), color='#1a1a1a')
    draw = ImageDraw.Draw(img)

    # Draw border circle
    border_width = max(3, size // 30)
    draw.ellipse([border_width, border_width, size-border_width, size-border_width],
                 outline='#d4af37', width=border_width, fill='#1a1a1a')

    # Draw crossed swords (simplified)
    center = size // 2
    sword_length = size // 3
    sword_width = max(2, size // 25)

    # Red sword (diagonal \)
    for i in range(-sword_width//2, sword_width//2 + 1):
        draw.line([(center-sword_length+i, center-sword_length+i),
                   (center+sword_length+i, center+sword_length+i)],
                  fill='#ff6b6b', width=sword_width)

    # Blue sword (diagonal /)
    for i in range(-sword_width//2, sword_width//2 + 1):
        draw.line([(center-sword_length+i, center+sword_length-i),
                   (center+sword_length+i, center-sword_length-i)],
                  fill='#6b6bff', width=sword_width)

    # Green center circle
    shield_radius = size // 10
    draw.ellipse([center-shield_radius, center-shield_radius,
                  center+shield_radius, center+shield_radius],
                 fill='#6bff6b')

    # Inner circle
    inner_radius = shield_radius * 3 // 4
    draw.ellipse([center-inner_radius, center-inner_radius,
                  center+inner_radius, center+inner_radius],
                 fill='#1a1a1a')

    # Try to draw "W" text
    try:
        font_size = size // 8
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        try:
            font = ImageFont.load_default()
        except:
            font = None

    if font:
        # Get text bbox for centering
        bbox = draw.textbbox((0, 0), "W", font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        text_x = center - text_width // 2
        text_y = center - text_height // 2
        draw.text((text_x, text_y), "W", fill='#d4af37', font=font)

    # Save the image
    img.save(output_path, 'PNG')
    print(f"Created {output_path} ({size}x{size})")

def main():
    """Generate icons in multiple sizes."""
    static_dir = os.path.join(os.path.dirname(__file__), 'static')

    if HAS_PIL:
        create_icon_with_pil(192, os.path.join(static_dir, 'icon-192.png'))
        create_icon_with_pil(512, os.path.join(static_dir, 'icon-512.png'))
        print("Icons created successfully!")
    else:
        print("WARNING: PIL/Pillow not available.")
        print("The SVG icon will be used as fallback.")
        print("To generate PNG icons, install Pillow: pip install Pillow")
        # Create empty placeholder files
        create_fallback_icon(192, os.path.join(static_dir, 'icon-192.png'))
        create_fallback_icon(512, os.path.join(static_dir, 'icon-512.png'))

if __name__ == '__main__':
    main()
