(() => {
  const ATTRIBUTE_ALIASES = new Map([
    ["data-chute-ui-enhancements", "data-filechute-ui-enhancements"],
    ["data-chute-resize-v2", "data-filechute-resize-v2"],
    ["data-chute-resize-v3", "data-filechute-resize-v3"],
    ["data-chute-image-resize", "data-filechute-image-resize"],
    ["data-chute-shelf-refresh", "data-filechute-shelf-refresh"],
    ["data-chute-directory", "data-filechute-directory"]
  ]);

  function mirrorAttributes(root) {
    if (!(root instanceof Element)) return;
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      for (const [source, target] of ATTRIBUTE_ALIASES) {
        if (!element.hasAttribute(source)) continue;
        const value = element.getAttribute(source) ?? "";
        if (element.getAttribute(target) !== value) element.setAttribute(target, value);
      }
    }
  }

  function rebrandStatus() {
    const status = document.querySelector("#status");
    if (!status || !status.textContent?.includes("FileChute")) return;
    status.textContent = status.textContent.replaceAll("FileChute", "Chute");
  }

  mirrorAttributes(document.documentElement);
  rebrandStatus();

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        mirrorAttributes(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) mirrorAttributes(node);
      }
    }
    rebrandStatus();
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTE_ALIASES.keys()]
  });
})();
