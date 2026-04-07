---
name: video-frames
description: Extract frames or thumbnails from videos using ffmpeg.
metadata: { "klaus": { "emoji": "🎞️", "requires": { "bins": ["ffmpeg"] }, "install": [{ "id": "brew", "kind": "brew", "formula": "ffmpeg", "label": "Install ffmpeg (brew)" }] } }
---

# Video Frames (ffmpeg)

Use `ffmpeg` to extract frames from video files for visual analysis.

## When to Use

- User sends a video and asks "what's in this video?"
- User wants a screenshot/frame at a specific timestamp
- User wants to analyze video content visually

## Commands

### Extract first frame

```bash
ffmpeg -i /path/to/video.mp4 -vframes 1 -q:v 2 /tmp/frame.jpg
```

### Extract frame at specific timestamp

```bash
ffmpeg -ss 00:00:10 -i /path/to/video.mp4 -vframes 1 -q:v 2 /tmp/frame-10s.jpg
```

### Extract multiple frames (one per second)

```bash
ffmpeg -i /path/to/video.mp4 -vf "fps=1" -q:v 2 /tmp/frames_%03d.jpg
```

### Extract keyframes only

```bash
ffmpeg -i /path/to/video.mp4 -vf "select=eq(pict_type\,I)" -vsync vfr -q:v 2 /tmp/keyframe_%03d.jpg
```

### Get video info (duration, resolution, codec)

```bash
ffprobe -v quiet -print_format json -show_format -show_streams /path/to/video.mp4
```

### Create a thumbnail grid (contact sheet)

```bash
ffmpeg -i /path/to/video.mp4 -vf "select=not(mod(n\,30)),scale=320:-1,tile=3x3" -frames:v 1 -q:v 2 /tmp/grid.jpg
```

## Workflow

1. First run `ffprobe` to get video duration and info
2. Extract frames at relevant timestamps
3. Read the extracted image(s) to analyze content visually
4. Report findings to user

## Notes

- Use `-q:v 2` for high quality JPEG output
- Use `.png` for lossless frames when precision matters
- Always extract to `/tmp/` to avoid polluting the working directory
- After extracting, use the Read tool to view the image and describe what you see
