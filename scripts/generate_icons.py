import os
import sys
import subprocess
import math

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image, ImageDraw

def create_master_icon(size=2048):
    # Transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale factor from 1024 base
    scale = size / 1024.0

    # 1. White squircle background
    radius = int(225 * scale)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(255, 255, 255, 255))

    # 2. Black musical note
    black = (0, 0, 0, 255)
    
    # Notehead (Circle)
    cx = int(388 * scale)
    cy = int(710 * scale)
    r = int(132 * scale)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=black)

    # Stem
    stem_left = int(494 * scale)
    stem_top = int(175 * scale)
    stem_right = int(546 * scale)
    stem_bottom = int(710 * scale)
    draw.rectangle([stem_left, stem_top, stem_right, stem_bottom], fill=black)

    # Flag
    p1 = (int(494 * scale), int(175 * scale))
    p2 = (int(802 * scale), int(305 * scale))
    p3 = (int(768 * scale), int(393 * scale))
    p4 = (int(546 * scale), int(335 * scale))
    draw.polygon([p1, p2, p3, p4], fill=black)

    # Rounded cap on the flag tip
    cap_x1 = int(750 * scale)
    cap_y1 = int(300 * scale)
    cap_x2 = int(825 * scale)
    cap_y2 = int(405 * scale)
    draw.ellipse([cap_x1, cap_y1, cap_x2, cap_y2], fill=black)

    return img

def create_round_icon(master_img, size):
    img_resized = master_img.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, size - 1, size - 1], fill=255)
    
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    output.paste(img_resized, (0, 0), mask=mask)
    return output

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print(f"Generating Playerium icons in: {root_dir}")

    master = create_master_icon(2048)

    # 1. Save assets/icon.png and build/icon.png
    assets_dir = os.path.join(root_dir, "assets")
    build_dir = os.path.join(root_dir, "build")
    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(build_dir, exist_ok=True)

    icon_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(os.path.join(assets_dir, "icon.png"), "PNG")
    icon_512.save(os.path.join(build_dir, "icon.png"), "PNG")
    print("Saved assets/icon.png and build/icon.png (512x512)")

    # 2. Save build/icon.ico for Windows
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(os.path.join(build_dir, "icon.ico"), format="ICO", sizes=ico_sizes)
    master.save(os.path.join(assets_dir, "icon.ico"), format="ICO", sizes=ico_sizes)
    print("Saved build/icon.ico and assets/icon.ico")

    # 3. Save Android mipmaps
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192
    }

    res_dir = os.path.join(root_dir, "android", "app", "src", "main", "res")
    for folder, dim in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # Standard launcher icon
        icon_img = master.resize((dim, dim), Image.Resampling.LANCZOS)
        icon_img.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")

        # Round launcher icon
        round_img = create_round_icon(master, dim)
        round_img.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")
        print(f"Saved {folder}/ic_launcher.png and ic_launcher_round.png ({dim}x{dim})")

    print("\nAll application icons generated successfully!")

if __name__ == "__main__":
    main()
