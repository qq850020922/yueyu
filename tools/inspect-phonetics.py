"""Produce waveform/spectrogram sheets for choosing local recording boundaries.
Tool-only dependencies: numpy, Pillow. No browser synthesis or vowel concatenation.
"""
import json
import wave
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PLAN = json.loads((ROOT / 'tools/phonetic-segments.json').read_text(encoding='utf-8'))

def samples(syllable):
    source = ROOT / 'media/phonetic-sources' if '/' in syllable else ROOT / 'media/voice-cuhk'
    with wave.open(str(source / (syllable + '.wav')), 'rb') as wav:
        rate = wav.getframerate()
        assert wav.getnchannels() == 1
        width = wav.getsampwidth()
        raw = wav.readframes(wav.getnframes())
        data = (np.frombuffer(raw, np.uint8).astype(float) - 128) / 128 if width == 1 else np.frombuffer(raw, '<i2').astype(float)/32768
    return rate, data

for kind, items in PLAN.items():
    entries = list(items.items())
    for page in range(0, len(entries), 12):
        subset = entries[page:page+12]
        sheet = Image.new('RGB', (1000, len(subset)*130), 'white')
        draw = ImageDraw.Draw(sheet)
        for row, (symbol, spec) in enumerate(subset):
            rate, data = samples(spec[0])
            base = row * 130
            axis = max(2, len(data)/rate)
            blocks = np.lib.stride_tricks.sliding_window_view(data, 512)[::64]
            spectrum = np.abs(np.fft.rfft(blocks * np.hanning(512), axis=1))[:, :int(5000/rate*512)]
            image = np.clip((20*np.log10(spectrum + 1e-5) + 55) * 255/65, 0, 255).astype(np.uint8)
            image = Image.fromarray(255-image.T[::-1]).convert('RGB')
            image = image.resize((int(len(data)/rate*850/axis), 75))
            sheet.paste(image, (130, base+30))
            draw.text((5, base+40), symbol + ' / ' + spec[0], fill='black')
            if len(spec) == 3:
                for t in spec[1:]:
                    if t < 0: t += len(data)/rate
                    x = 130 + int(t*850/axis)
                    draw.line((x,base+25,x,base+110), fill='red', width=2)
            for t in np.arange(0, axis+.01, .1):
                x = 130 + int(t*850/axis)
                draw.line((x,base+105,x,base+110), fill='black')
                if round(t*10)%2 == 0: draw.text((x,base+113), f'{t:.1f}', fill='black')
            rms = np.array([np.sqrt(np.mean(data[i:i+110]**2)) for i in range(0,len(data)-110,110)])
            active = np.flatnonzero(rms > max(.015, rms.max()*.12))
            print(kind, symbol, spec[0], 'active', round(active[0]*110/rate,3), round(active[-1]*110/rate,3))
        target = Path(tempfile.gettempdir()) / f'canto-{kind}-{page//12}.png'
        sheet.save(target)
        print(target)
