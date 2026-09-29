/**
 * Camera-relative WASD.
 * Yaw 0 looks down +Z, matching the first-person camera.
 * W moves toward the crosshair, S reverses it, A is left, D is right.
 */
export function cameraRelativeWish(
  yaw: number,
  forward: number,
  strafe: number
): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return {
    x: sin * forward - cos * strafe,
    z: cos * forward + sin * strafe,
  };
}
