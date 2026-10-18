import os
import sys
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image, ImageDraw

def create_master_icon(size=2048):
    source = os.path.join(os.path.dirname(__file__), "..", "assets", "icon-master.png")
    with Image.open(source) as image:
        return image.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)

def create_round_icon(master_img, size):
    img_resized = master_img.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, size - 1, size - 1], fill=255)
    
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    output.paste(img_resized, (0, 0), mask=mask)
    return output

def create_adaptive_icons(root_dir):
    """Android / One UI owns the final tint and launcher mask, not our artwork."""
    root = Path(root_dir)
    source = ET.parse(root / "assets" / "icon.svg").getroot()
    mark = source.find(".//*[@id='icon-mark']")
    background = source.find(".//*[@id='icon-background']")
    if source.get("viewBox") != "0 0 108 108" or mark is None or background is None:
        raise ValueError("icon.svg must define icon-mark and icon-background in a 108 dp viewport")
    res = root / "android" / "app" / "src" / "main" / "res"
    drawable = res / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)

    # Both layers have identical geometry. Monochrome must be an alpha mask:
    # a white mark on transparency, without a baked-in colored background.
    for name, color in [("ic_launcher_foreground", mark.get("fill")),
                        ("ic_launcher_monochrome", "#FFFFFFFF")]:
        vector = ('<?xml version="1.0" encoding="utf-8"?>\n'
                  '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
                  '    android:width="108dp" android:height="108dp"\n'
                  '    android:viewportWidth="108" android:viewportHeight="108">\n'
                  '    <group android:pivotX="54" android:pivotY="54" android:scaleX="0.9" android:scaleY="0.9">\n'
                  f'        <path android:fillColor="{color}" android:pathData="{mark.get("d")}" />\n'
                  '    </group>\n'
                  '</vector>\n')
        (drawable / f"{name}.xml").write_text(vector, encoding="utf-8")

    for qualifier, extra in [("v26", ""),
                             ("v33", '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n')]:
        directory = res / f"mipmap-anydpi-{qualifier}"
        directory.mkdir(parents=True, exist_ok=True)
        xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
               '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
               '    <background android:drawable="@color/icon_background" />\n'
               '    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
               + extra + '</adaptive-icon>\n')
        for name in ["ic_launcher.xml", "ic_launcher_round.xml"]:
            (directory / name).write_text(xml, encoding="utf-8")

    colors = ('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
              f'    <color name="icon_background">{background.get("fill")}</color>\n'
              '</resources>\n')
    (res / "values" / "icon_colors.xml").write_text(colors, encoding="utf-8")


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

    create_adaptive_icons(root_dir)
    print("\nAll application icons generated successfully!")

if __name__ == "__main__":
    main()
