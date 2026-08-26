export default {
  id: "ready",
  name: "Ready to receive",
  trigger: "drop-ready",
  cycle: false,
  interruptible: true,
  loop: false,
  sequence: [
    { face: "•O•", label: "DROP!", className: "ready", duration: 240 }
  ]
};
