# FormBridge films: source and limits

The launch film and walkthrough show a synthetic restaurant enquiry run through the public FormBridge app on 30 September 2026. The screens are edited captures of real app states, sequenced as a film; they are not an uninterrupted screen recording. The example restaurant and messages are fictional.

The [scene file](film-scenes.json) is the storyboard and narration transcript. The source screen captures used for each scene are under [`captures/`](captures/). There are no benchmark scores or internal evaluation screens in either film.

Narration was generated with the OpenAI text-to-speech API using the `marin` voice. The API key was read from the ignored local `.env.local` file and is not in the repository. The rendered MP4 files contain the narration and on-screen text; raw voice files were kept outside the repository.

To regenerate the films, install Pillow and `imageio-ffmpeg` in a Python environment, then run:

```bash
node scripts/generate-film-voice.mjs
python scripts/render-films.py
```

The speech step uses the OpenAI API and may incur charges. The renderer also writes the README banner and video posters. It currently uses system Avenir Next and Menlo fonts on macOS; substitute equivalent licensed fonts to reproduce it on another platform.

These films demonstrate product behaviour on one case. They do not establish extraction accuracy, reliability across customer language, or a completed restaurant booking.
