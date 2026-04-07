---
name: songsee
description: Generate spectrograms and audio feature visualizations.
metadata: { "klaus": { "emoji": "🌊", "requires": { "bins": ["songsee"] }, "install": [{ "id": "brew", "kind": "brew", "formula": "steipete/tap/songsee", "label": "Install songsee (brew)" }] } }
---

# songsee

Generate spectrograms and multi-panel audio feature visualizations from audio files.

## When to Use

- User sends an audio file and wants visual analysis
- User asks about audio characteristics (frequency, tempo, etc.)
- User wants a spectrogram or audio visualization

## Commands

### Basic spectrogram

```bash
songsee /path/to/audio.mp3 -o /tmp/spectrogram.jpg
```

### Multi-panel visualization

```bash
songsee /path/to/audio.mp3 --viz spectrogram,mel,chroma,loudness -o /tmp/panels.jpg
```

### All available visualizations

```bash
songsee /path/to/audio.mp3 --viz spectrogram,mel,chroma,hpss,selfsim,loudness,tempogram,mfcc,flux -o /tmp/full.jpg
```

### Time slice (analyze specific section)

```bash
songsee /path/to/audio.mp3 --start 12.5 --duration 8 -o /tmp/slice.jpg
```

### Custom style and size

```bash
songsee /path/to/audio.mp3 --style magma --width 1200 --height 400 -o /tmp/styled.jpg
```

### From stdin

```bash
cat /path/to/audio.mp3 | songsee - --format png -o /tmp/out.png
```

## Visualization Types

| Type | Description |
|------|-------------|
| spectrogram | Standard frequency spectrogram |
| mel | Mel-scaled spectrogram |
| chroma | Pitch class distribution over time |
| hpss | Harmonic-percussive separation |
| selfsim | Self-similarity matrix |
| loudness | Loudness over time |
| tempogram | Tempo estimation |
| mfcc | Mel-frequency cepstral coefficients |
| flux | Spectral flux (onset detection) |

## Style Palettes

classic, magma, inferno, viridis, gray

## Workflow

1. Run `songsee` to generate visualization
2. Read the output image to analyze the audio characteristics
3. Describe the findings (frequency range, tempo patterns, dynamics, etc.)

## Notes

- WAV/MP3 decode natively; other formats need `ffmpeg` on PATH
- Multiple `--viz` types render as a grid
- Always output to `/tmp/` to keep things clean
