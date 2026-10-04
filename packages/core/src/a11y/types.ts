// 0-255 sRGB channels. Alpha, when present, is 0-1.
export type RGB = readonly [r: number, g: number, b: number];
export type RGBA = readonly [r: number, g: number, b: number, a?: number];

export type Simulation = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'grayscale';
