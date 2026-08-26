# Chute — Chrome Web Store notes

Chute is a local-first Chromium extension that exposes one user-selected folder as a browser shelf and adds the optional Chutty mascot on supported image surfaces.

## Permission model

Required permissions are limited to browser storage, active-tab/scripting behavior used by the user-triggered browser handoff, and the side panel. Chute does not require a localhost server or native helper.

Optional HTTP/HTTPS host permission exists so user-triggered browser-resource intake can fetch the exact resource the user dragged when the browser does not expose a usable native `File` object.

## File System Access

The user explicitly chooses a directory. Chute stores that handle in browser-managed storage and only resolves descendants of that handle. Chute cannot navigate above the selected root through its own UI.

## Chutty

Chutty is a floating intake surface on supported ChatGPT, Google, and Yandex pages. It does not have an independent filesystem model. A drop onto Chutty is handed to the same selected Chute root and produces lifecycle animation states such as Ready, Eating, Success, or Failure.

Chutty preferences are managed from the Chute Settings dialog, including visibility, left/right position, hover menu, click-to-cycle behavior, support-button visibility, enabled click animations, and click-animation order.

Animation definitions are packaged extension assets under `animations/assets/<animation>/animation.js`. Image-backed sequences can reference frames stored in the same animation directory.

## Support link

The Support Chutty button opens Chute's built-in Stripe support destination only after the user explicitly clicks the support control. The destination is fixed by the extension developer and is not editable by end users.

## Privacy summary

Local shelf files are not uploaded to a Chute service. Browser-image candidate URLs are examined only to fulfill a user-initiated drag/drop into Chute or Chutty. Thumbnails, settings, metadata, and resizing remain local to the browser and selected folder except when the user explicitly opens the external support link.
