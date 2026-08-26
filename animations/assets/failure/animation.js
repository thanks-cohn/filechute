export default {
  id: "failure",
  name: "Could not receive",
  trigger: "drop-failure",
  cycle: false,
  interruptible: true,
  loop: false,
  restoreAfter: 1200,
  sequence: [
    { face: "×︵×", label: "TRY AGAIN", className: "failure", duration: 320 }
  ]
};
