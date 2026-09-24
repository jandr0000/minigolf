// Silhouette of the Osborne bull, facing right, drawn on a 1000 x 640 canvas (y down, ground at y = 620).
// Each part is a closed path (M, L, C, Z only) so it can be previewed as SVG and extruded in 3D.
export const OSBORNE_W = 1000;
export const OSBORNE_GROUND = 620;

export const OSBORNE_PARTS = [
  // torso, neck and head
  `M 82 285 C 130 255 235 258 330 268 C 420 276 490 250 545 205 C 590 165 650 138 705 150
   C 745 160 772 182 795 205 C 825 218 850 250 868 292 C 878 315 895 335 893 352
   C 892 368 876 374 862 370 C 840 364 822 348 805 338 C 790 330 772 338 762 356
   C 750 378 742 410 722 440 C 690 480 620 476 560 460 C 490 444 390 428 300 430
   C 220 432 160 420 118 385 C 78 350 58 305 82 285 Z`,
  // horns
  `M 818 240 C 808 196 846 138 926 100 C 890 150 872 208 846 268 Z`,
  `M 800 222 C 780 172 806 112 858 78 C 838 122 830 176 826 236 Z`,
  // ear
  `M 806 236 C 776 214 742 208 720 220 C 744 244 780 252 810 246 Z`,
  // front legs
  `M 668 440 L 726 428 C 736 510 728 552 731 590 L 736 620 L 684 620 L 688 592 C 684 550 676 505 668 450 Z`,
  `M 598 455 L 662 455 C 660 510 640 552 632 592 L 626 620 L 578 620 L 588 590 C 596 550 604 505 598 455 Z`,
  // rear legs
  `M 116 366 C 90 460 112 510 146 552 L 150 588 L 146 620 L 196 620 L 198 588 L 196 552 C 216 505 262 450 262 390 Z`,
  `M 250 400 C 244 470 256 520 268 552 L 268 588 L 264 620 L 314 620 L 312 588 L 310 552 C 320 505 336 450 328 405 Z`,
  // tail
  `M 84 278 C 46 305 28 375 50 438 C 54 452 46 470 40 482 C 36 494 46 504 58 498
   C 72 490 76 470 70 452 C 58 392 62 328 102 296 Z`,
];

// Returns polygons as arrays of {x, y} in design space (y down).
export function pathToPolygon(d, steps = 36) {
  const t = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const pts = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  const num = () => parseFloat(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M' || c === 'L') {
      cx = num();
      cy = num();
      pts.push({ x: cx, y: cy });
    } else if (c === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const v = 1 - u;
        pts.push({
          x: v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
          y: v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
        });
      }
      cx = x;
      cy = y;
    }
  }
  return pts;
}
