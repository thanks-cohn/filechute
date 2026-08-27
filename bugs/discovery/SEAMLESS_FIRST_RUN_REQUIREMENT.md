# Seamless first-run requirement

FileChute should request a user-selected folder explicitly and remember it. The product must not silently take filesystem access.

If the user has no preference, first run should recommend the operating system's normal screenshots/pictures location in plain language, e.g. "No preference? Use your Screenshots/Pictures folder." The user still confirms the folder through the platform picker/permission flow.

After approval, FileChute should persist the directory handle and use `queryPermission()` on later launches. It should only ask the user to reconnect when Chromium reports that the saved handle is no longer granted. Normal launches and drags should not repeat the folder chooser.

This requirement is deliberately separate from website permissions. To match Chute's seamless page behavior, FileChute's shipping manifest declares normal HTTP/HTTPS page access up front so its single recovery receiver is already present when the user drops a file.
