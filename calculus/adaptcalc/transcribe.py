"""Transcribe a photo of handwritten work into structured lines with Claude vision.

Backends
  * ClaudeTranscriber: Anthropic Messages API, image + JSON-schema structured
    output. Needs Anthropic credentials (ANTHROPIC_API_KEY or an `ant auth`
    profile).
  * SidecarTranscriber: reads `<photo>.transcript.json` written next to the
    photo by a person or by an agent session that transcribed the image
    itself (same schema, same instructions). Used when no API credentials are
    available; the pipeline records which backend produced each transcript.
"""
from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path

MODEL = "claude-opus-5-5"

INSTRUCTIONS = """You are transcribing a photo of a student's handwritten math work (arithmetic, algebra or calculus).

How the page is written:
- Each problem starts with its number (e.g. "3." or "#3" or a circled 3). A packet code such as "D1" may be written at the top of the page.
- One step per line. Transcribe every line, in order, as its own entry.
- Mistakes are crossed out, not erased. A line (or part of a line) with a line or scribble through it is crossed_out=true. Still transcribe what it says if you can read it.
- The final answer is boxed. Mark that line boxed=true and copy the boxed value into final_answer.
- If the student wrote "skip" (or left the problem blank after the number), set skipped=true.
- The work is usually written right on printed pages. List ONLY the problems whose number can be seen in this photo.
  A set of pages has other problems on other pages: never list a problem that is not on this page, and never mark
  one skipped because it is missing from this photo.

For each line give:
- text: exactly what is written, in plain linear notation (use lim_(x->2), sqrt(), ^, /, |x|, ∞, ε, δ, ±, ≤, ≥). Do not fix mistakes.
- sympy: the mathematics of the line as SymPy syntax, or "" for words-only lines.
  * A chain of equal quantities is written with " = " between the parts, exactly as the student chained them:
    "f(2) = 4 - 3 = 1", "m = (6 - 1)/(3 - 2)", "Limit((x**2 - 4)/(x - 2), x, 2) = Limit(x + 2, x, 2) = 4".
    If the line starts with "=", leave the leading "=" out of sympy and set continues=true.
  * An equation to be solved (not a chain of equal quantities) is written Eq(lhs, rhs), e.g. Eq(x**2 + 11*x + 30, 0).
  * Write limits as Limit(expr, x, a) for two-sided, Limit(expr, x, a, '-') or Limit(expr, x, a, '+') for one-sided. Use oo for infinity.
  * Inequalities: use <, <=, >, >= directly, e.g. "3*x - 2 < 7" or "-2 <= x" (one inequality per line).
  * An ordered pair or a system's solution is written Tuple(3, -2). Interval notation is written as the student wrote it in text, with sympy "".
  * A line with a plus-or-minus sign (±): copy it into text with ±, and leave sympy "".
  * Word answers ("no solution", "identity", "contradiction", "yes") go in text with sympy "".
  * Use * for multiplication, ** for powers, sqrt(), Abs(), sin(), cos(), pi, E, epsilon, delta.
  * Transcribe what the student wrote, including errors. Never correct the mathematics.
- continues: true when the line begins with "=" and continues the previous line's chain.
- crossed_out, boxed: booleans as described. For a boxed line, final_answer is the value in the box without a leading "=".

If a line is illegible, set text to "[illegible]" and sympy to "". Report anything unusual in notes."""

SCHEMA = {
    "type": "object",
    "properties": {
        "packet_code": {"type": ["string", "null"]},
        "problems": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer"},
                    "skipped": {"type": "boolean"},
                    "lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string"},
                                "sympy": {"type": "string"},
                                "continues": {"type": "boolean"},
                                "crossed_out": {"type": "boolean"},
                                "boxed": {"type": "boolean"},
                            },
                            "required": ["text", "sympy", "continues", "crossed_out", "boxed"],
                            "additionalProperties": False,
                        },
                    },
                    "final_answer": {"type": ["string", "null"]},
                },
                "required": ["number", "skipped", "lines", "final_answer"],
                "additionalProperties": False,
            },
        },
        "notes": {"type": "string"},
    },
    "required": ["packet_code", "problems", "notes"],
    "additionalProperties": False,
}


def validate(doc: dict) -> dict:
    """Minimal structural validation of a transcript (either backend)."""
    if not isinstance(doc.get("problems"), list):
        raise ValueError("transcript has no problems list")
    for p in doc["problems"]:
        if not isinstance(p.get("number"), int):
            raise ValueError("problem without integer number")
        for ln in p.get("lines", []):
            for k in ("text", "sympy", "crossed_out", "boxed"):
                if k not in ln:
                    raise ValueError(f"problem {p['number']}: line missing {k}")
            ln.setdefault("continues", False)
        p.setdefault("skipped", False)
        p.setdefault("final_answer", None)
    doc.setdefault("packet_code", None)
    doc.setdefault("notes", "")
    return doc


def packet_context(problems: list[dict]) -> str:
    """What the printed packet asked (helps disambiguate handwriting; never the key)."""
    return "\n".join(f"{p['number']}. {p['data']['plain']}" for p in problems)


MAX_SIDE = 2400          # px; keeps handwriting legible and the request well under the API's image limits
MAX_BYTES = 4_500_000    # the API rejects base64 images over 5 MB


def prepare_image(photo: Path) -> tuple[str, bytes]:
    """Any phone photo (HEIC, JPEG, PNG, ...) -> upright JPEG within the API's size limits."""
    import io

    from PIL import Image, ImageOps

    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
    except ImportError:  # HEIC support is optional outside the server image
        pass
    try:
        im = Image.open(photo)
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise UnreadableImage(f"could not open {photo.name} as an image: {e}") from e
    side = MAX_SIDE
    while True:
        work = im.copy()
        work.thumbnail((side, side), Image.LANCZOS)
        buf = io.BytesIO()
        work.save(buf, "JPEG", quality=88, optimize=True)
        if buf.tell() <= MAX_BYTES or side <= 1000:
            return "image/jpeg", buf.getvalue()
        side = int(side * 0.8)


class UnreadableImage(Exception):
    pass


class ClaudeTranscriber:
    backend = "claude-vision"

    def __init__(self, model: str = MODEL):
        import anthropic

        self.anthropic = anthropic
        self.client = anthropic.Anthropic()
        self.model = model

    def transcribe(self, photo: Path, context: str = "") -> dict:
        media, raw = prepare_image(photo)
        data = base64.standard_b64encode(raw).decode()
        prompt = INSTRUCTIONS
        if context:
            prompt += "\n\nThe printed problems on the packet were:\n" + context
        with self.client.beta.messages.stream(
            model=self.model,
            max_tokens=32000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}},
                {"type": "text", "text": prompt},
            ]}],
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            raise RuntimeError(f"transcription refused: {getattr(msg, 'stop_details', None)}")
        if msg.stop_reason == "max_tokens":
            raise RuntimeError("transcription truncated (max_tokens)")
        text = next(b.text for b in msg.content if b.type == "text")
        return validate(json.loads(text))


class SidecarTranscriber:
    backend = "sidecar"

    def transcribe(self, photo: Path, context: str = "") -> dict:
        side = sidecar_path(photo)
        if not side.exists():
            request = side.with_name(photo.name + ".transcription-request.md")
            request.write_text(
                f"# Transcription needed\n\nPhoto: {photo.name}\n\n{INSTRUCTIONS}\n\n"
                f"Printed problems:\n{context}\n\nWrite JSON matching this schema to {side.name}:\n\n"
                f"```json\n{json.dumps(SCHEMA, indent=2)}\n```\n", encoding="utf-8")
            raise PendingTranscription(str(side))
        doc = json.loads(side.read_text(encoding="utf-8"))
        doc.setdefault("backend", "sidecar")
        return validate(doc)


class PendingTranscription(Exception):
    pass


def sidecar_path(photo: Path) -> Path:
    return photo.with_name(photo.name + ".transcript.json")


def default_transcriber(prefer: str | None = None):
    """Claude vision when Anthropic credentials are configured; the sidecar backend otherwise.

    `prefer` (or ADAPTCALC_TRANSCRIBER) forces "claude" or "sidecar", e.g. to use
    an `ant auth login` profile, which the SDK resolves at request time.
    """
    import os

    prefer = prefer or os.environ.get("ADAPTCALC_TRANSCRIBER")
    if prefer == "sidecar":
        return SidecarTranscriber()
    if prefer == "claude":
        return ClaudeTranscriber()
    import anthropic

    c = anthropic.Anthropic()
    if c.api_key or getattr(c, "auth_token", None):
        return ClaudeTranscriber()
    return SidecarTranscriber()
