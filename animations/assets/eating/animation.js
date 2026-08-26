export default {
  id: "eating",
  name: "Eating",
  trigger: "drop-accepted",
  cycle: false,
  interruptible: true,
  loop: true,
  sequence: [
    { face: "•◡•", label: "EATING", className: "play-chomp", duration: 180 },
    { face: "•O•", label: "EATING", className: "play-squish", duration: 180 }
  ]
};
