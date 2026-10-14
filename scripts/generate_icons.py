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

    adaptive_dir = os.path.join(res_dir, "mipmap-anydpi-v26")
    adaptive33_dir = os.path.join(res_dir, "mipmap-anydpi-v33")
    drawable_dir = os.path.join(res_dir, "drawable")
    os.makedirs(drawable_dir, exist_ok=True)
    # Android applies the launcher mask; keep the complete vinyl inside its safe zone.
    master.resize((432, 432), Image.Resampling.LANCZOS).save(os.path.join(drawable_dir, "ic_launcher_vinyl.png"))
    foreground = '<inset xmlns:android="http://schemas.android.com/apk/res/android" android:drawable="@drawable/ic_launcher_vinyl" android:inset="18%" />'
    with open(os.path.join(drawable_dir, "ic_launcher_foreground.xml"), "w", encoding="utf-8") as file:
        file.write(foreground)
    monochrome = '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="M54,22 A32,32 0,1 1,54 86 A32,32 0,1 1,54 22 M47,40 L69,54 L47,68 Z" /></vector>'
    with open(os.path.join(drawable_dir, "ic_launcher_monochrome.xml"), "w", encoding="utf-8") as file:
        file.write(monochrome)
    for directory, extra in [(adaptive_dir, ""), (adaptive33_dir, '<monochrome android:drawable="@drawable/ic_launcher_monochrome" />')]:
        os.makedirs(directory, exist_ok=True)
        xml = '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/icon_background" /><foreground android:drawable="@drawable/ic_launcher_foreground" />'+extra+'</adaptive-icon>'
        for name in ["ic_launcher.xml", "ic_launcher_round.xml"]:
            with open(os.path.join(directory, name), "w", encoding="utf-8") as file:
                file.write(xml)
    values_dir = os.path.join(res_dir, "values")
    with open(os.path.join(values_dir, "icon_colors.xml"), "w", encoding="utf-8") as file:
        file.write('<resources><color name="icon_background">#42210F</color></resources>')
    print("\nAll application icons generated successfully!")

if __name__ == "__main__":
    main()
