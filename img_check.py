from PIL import Image
import sys

def check_img(path):
    try:
        img = Image.open(path)
        print(f"{path}: {img.size}")
    except Exception as e:
        print(f"Error {path}: {e}")

check_img('assets/sprites.png')
check_img('assets/ground_bg.png')
check_img('assets/ground_bg_night.png')
check_img('assets/sheep.png')
