# pitch/gen_vo.py — generates English VO per segment (edge-tts, natural neural
# voice) + segments.json with the exact text used per clip (source of truth
# for subtitles and for the user to re-record their own voice later).
# Run: pitch/.venv/Scripts/python pitch/gen_vo.py
import asyncio, json, os
import edge_tts

VOICE = os.environ.get("PITCH_VOICE", "en-US-BrianNeural")
RATE = os.environ.get("PITCH_RATE", "+0%")
OUT = os.path.join(os.path.dirname(__file__), "vo")
os.makedirs(OUT, exist_ok=True)

SEGMENTS = {
 "s1": "What you are about to see is real — live pages, a live pipeline, right now. Scams like this cost people more than ten billion dollars a year — and none of it is a virus. It's a conversation designed to make you decide badly. SOVIR is the shield built for exactly that.",
 "s2": "This is SOVIR — a digital-autonomy shield. One account: your devices, your alerts, your permissions — bound to you and only you. It watches what pages and apps ask of you — never you — and only with explicit consent.",
 "s4": "Now we attack it, live, in Opera Air. Real pages, reported as phishing this week — impersonating brands you know. The extension observes each one and emits typed signals: credential requests, urgency language, unverified identity, link mismatches. And on a real login, the same signal stays a fact — not an accusation. Facebook, your bank, your chats — excluded by default unless you say otherwise.",
 "s3": "Every detection lands here — your security alerts. Each one is a real event that crossed the privacy gate: its verdict, its severity, and exactly when it happened. Nothing is a mystery.",
 "s5": "Open one, and you see what nobody else shows: which voters fired — heuristic, on-device models — what each one saw, where it came from, and how sure it is. Facts, hypotheses and decisions never mix. That is not a screenshot pasted into a chatbot.",
 "s6": "Consent is per source and per device — and it expires. Revoke, and collection stops cold — fail-closed. Your history exports, or erases, in one click. And across the panel: devices, investigations, audit — the whole system is inspectable.",
 "s7": "In Opera Air the extension lives where you live: a quiet panel, real counters, and the protected-by-default list — sensitive sites stay unobserved until you choose otherwise. One consent, typed signals, every notice explains itself.",
 "s7b": "On Android, the same contract — the accessibility observer reads screen metadata, never your passwords or screenshots — and alerts reach you as notifications, live. Two gates, not one. Local-first: your text, your pixels, your data never leave the device.",
 "s8": "What's verified, you just watched. What's not ready, we say out loud. We don't sell promises — we show receipts. SOVIR. See the signals. Keep the choice.",
}

async def main():
    for name, text in SEGMENTS.items():
        out = os.path.join(OUT, f"vo_{name}.mp3")
        tts = edge_tts.Communicate(text, VOICE, rate=RATE)
        await tts.save(out)
        print("wrote", out)
    with open(os.path.join(OUT, "segments.json"), "w", encoding="utf-8") as f:
        json.dump(SEGMENTS, f, ensure_ascii=False, indent=2)

asyncio.run(main())
