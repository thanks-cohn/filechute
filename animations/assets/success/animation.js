export default {
  id: "success",
  name: "Success",
  trigger: "drop-success",
  cycle: false,
  interruptible: true,
  loop: false,
  restoreAfter: 900,
  sequence: [
    { face: "^ ^", label: "YUMMY", className: "success", duration: 360 }
  ]
};
