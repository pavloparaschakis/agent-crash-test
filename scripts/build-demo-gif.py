"""Build the small launch GIF from the verified demo narrative.

This is an asset-generation helper, not a runtime dependency. It is intentionally
kept outside the Node test path because the public CLI does not need Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "demo-terminal.gif"
STATE_DIFF = ROOT / "assets" / "state-diff.png"
WIDTH, HEIGHT = 1280, 720
BACKGROUND = (12, 18, 27)
FOREGROUND = (225, 235, 245)
MUTED = (142, 161, 180)
GREEN = (91, 214, 140)
AMBER = (255, 196, 92)
RED = (255, 112, 120)
BLUE = (105, 181, 255)


def font(size: int):
    candidates = [
        "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


TITLE = font(34)
BODY = font(25)
SMALL = font(20)


SLIDES = [
    (
        "Agent Crash Test",
        [
            ("Define the failure.", BLUE),
            ("Break the workflow.", AMBER),
            ("Prove the effect.", GREEN),
        ],
    ),
    (
        "$ node dist/cli.js run timeout-retry-duplicates.yaml",
        [
            ("MUTATION  timeout-after-write", AMBER),
            ("The server writes before the response times out.", FOREGROUND),
        ],
    ),
    (
        "Physical invocation timeline",
        [
            ("event-1  create_invoice  attempt=1  TIMEOUT", RED),
            ("event-2  create_invoice  attempt=2  SUCCESS", GREEN),
            ("event-3  get_state        effect_probe", BLUE),
        ],
    ),
    (
        "State contract",
        [
            ("Expected: invoices.length = 1", FOREGROUND),
            ("Observed: invoices.length = 2", RED),
            ("First divergence: event-2", AMBER),
        ],
    ),
    (
        "Actionable failure report",
        [
            ("ERROR exactly-one-invoice", RED),
            ("Duplicate transition detected", AMBER),
            ("Reproduce with the same pack + mutation seed", BLUE),
        ],
    ),
    (
        "Remediation",
        [
            ("Use a request ID or idempotency key", GREEN),
            ("Enforce idempotency at the write boundary.", GREEN),
            ("Not just in the final response.", FOREGROUND),
        ],
    ),
]


def make_slide(title: str, lines: list[tuple[str, tuple[int, int, int]]]):
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((54, 44, WIDTH - 54, HEIGHT - 44), radius=22, outline=(42, 62, 83), width=2)
    draw.text((88, 88), title, font=TITLE, fill=FOREGROUND)
    draw.line((88, 154, WIDTH - 88, 154), fill=(42, 62, 83), width=2)
    y = 214
    for line, color in lines:
        draw.text((104, y), line, font=BODY, fill=color)
        y += 76
    draw.text((88, HEIGHT - 94), "agent-crash-test  •  local-first  •  redacted reports", font=SMALL, fill=MUTED)
    return image


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [make_slide(title, lines) for title, lines in SLIDES]
    make_slide(
        "Before / after state contract",
        [
            ("Before  invoices.length = 0", MUTED),
            ("Expected delta             +1", FOREGROUND),
            ("After   invoices.length = 2", RED),
            ("Extra transition           +1", AMBER),
        ],
    ).save(STATE_DIFF)
    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=1400,
        loop=0,
        optimize=True,
    )
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
    print(f"wrote {STATE_DIFF} ({STATE_DIFF.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
