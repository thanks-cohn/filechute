# Chutty animations

Chutty animations live under:

```text
animations/
  catalog.js
  assets/
    idle/
      animation.js
      ...optional image files...
    eating/
      animation.js
      ...optional image files...
    success/
      animation.js
    failure/
      animation.js
```

Each animation owns one directory. `animation.js` is the sequence definition for that directory.

A sequence step can use the current drawn Chutty fallback:

```js
{ face: "•ᴗ•", label: "CHUTE", className: "play-pop", duration: 340 }
```

or an image in the same animation directory:

```js
{ image: "01.png", duration: 140 }
{ image: "02.png", duration: 140 }
{ image: "03.png", duration: 220 }
```

Supported animation fields:

- `id`: stable internal name.
- `name`: user-facing name shown in Chute settings.
- `trigger`: descriptive lifecycle trigger.
- `cycle`: whether normal Chutty clicks may cycle to this animation.
- `interruptible`: documents that another action may replace the sequence immediately.
- `loop`: repeat the sequence until another Chutty state interrupts it.
- `restoreAfter`: optional delay in milliseconds before returning to the user's current click-cycle state.
- `sequence`: ordered visual steps.
- each sequence step can contain `image`, `face`, `label`, `className`, and `duration`.

The runtime intentionally treats every new action as an interruption. A new click, a drag entering Chutty, a successful drop, or a failed drop cancels the previous sequence token immediately.

To add a new normal click animation:

1. Create `animations/assets/<name>/`.
2. Add `animation.js`.
3. Put any referenced images in that same directory.
4. Import the animation in `animations/catalog.js`.
5. Add its module path to `web_accessible_resources` in `manifest.json` if it will be used by Chutty on a webpage.

Automatic drop states such as `ready`, `eating`, `success`, and `failure` are lifecycle animations. Normal click animations are reorderable and individually enable/disable-able from Chute settings.
